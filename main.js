/***
Copyright © 2021 David Balan

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the “Software”), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
***/

const getEmailTransport = (() => {
    let transporter = null;
    return () => {
        const nodemailer = require("nodemailer");
        const config = require('./config.json'); 
        if (!transporter) {
            transporter = nodemailer.createTransport({
                host: config.email.host,
                port: config.email.port,
                secure: config.email.secure,
                auth: {
                    user: config.email.user,
                    pass: config.email.password
                },
            });
        }
        return transporter;
    }
})();

async function getCenterInformations(url) {
    const axios = require('axios');
    const { data: { data: { profile: { id } } } } = await axios.get(`${url}.json`);
    const { data: { data: center } } = await axios.get(`https://partners.doctolib.fr/booking/${id}.json`);
    const availableAgendas = center.agendas.filter(({ booking_disabled, booking_temporary_disabled }) => !booking_disabled && !booking_temporary_disabled);
    return center.places.map(({ id, formal_name, city }) => {
        const actualId = Number(id.replace('practice-', ''));
        const agendas = availableAgendas.filter(({ practice_id }) => practice_id === actualId);
        const motives = center.visit_motives.filter(({ id }) => agendas.some(({ visit_motive_ids }) => visit_motive_ids.includes(id)));
        return {
            id: actualId,
            url: `${url}?pid=${id}`,
            tag: id,
            name: formal_name,
            agendas: agendas.map(({ id, visit_motive_ids, practice_id }) => ({ id, visitMotives: visit_motive_ids, place: practice_id })),
            visitMotives: motives.map(({ id, name }) => ({ id, name })),
            city
        };
    }).filter(({ agendas, visitMotives }) => agendas.length > 0 && visitMotives.length > 0);
}

async function getAvailableTomorrowForCenter(centerInfo, date) {
    if (centerInfo.visitMotives.length === 0) {
        return null;
    }
    const day = require('dayjs');
    const tomorrow = (date ? day(date) : day().add(1, 'd')).format('YYYY-MM-DD');
    const axios = require('axios');
    const { data } = await axios.get(`https://partners.doctolib.fr/availabilities.json?start_date=${tomorrow}&visit_motive_ids=${centerInfo.visitMotives.map(({ id }) => id).join('-')}&agenda_ids=${centerInfo.agendas.map(({ id }) => id).join('-')}&insurance_sector=public&practice_ids=${centerInfo.agendas.map(({ place }) => place).join('-')}&destroy_temporary=true&limit=1`);

    if (data.availabilities.length === 0) {
        return null;
    }
    const line = data.availabilities[0];
    return {
        date: line.date,
        slots: line.slots,
    }
}

function applyFilterVisitMotives(centerInfo, filter) {
    if (!filter) {
        return centerInfo;
    }
    const filteredMotives = centerInfo.visitMotives.filter(filter);
    const filteredMotiveIds = centerInfo.visitMotives.map(({ id }) => id);
    const filteredAgendas = centerInfo.agendas.filter(({ visitMotives }) => visitMotives.some(visitMotiveId => filteredMotiveIds.includes(visitMotiveId)));
    return {
        ...centerInfo,
        visitMotives: filteredMotives,
        agendas: filteredAgendas,
    }
}

async function getAvailabilityMap(centers, filter) {
    const search = await Promise.all(centers.map(async (url) => {
        const centers = await getCenterInformations(url);
        return Promise.all(centers.map(async (center) => {
            const centerInfo = applyFilterVisitMotives(center, filter);
            const result = await getAvailableTomorrowForCenter(centerInfo);
            return {
                available: result ? result.slots.length : 0,
                name: centerInfo.name,
                when: result ? result.date : '',
                url: centerInfo.url,
                id: url,
            };
        }));
    }));

    return search.flat();
}
async function notifyPushBullet(profile, slots) {
    const pushBullet = require('pushbullet');
    const { promisify } = require('util');
    const bullet = new pushBullet(profile.notify.token);
    const getDevices = promisify(bullet.devices.bind(bullet));
    const link = promisify(bullet.link.bind(bullet));
    const { devices } = await getDevices({ limit: 20 });
    const usedDevices = devices.filter(({ pushable }) => pushable);
    await Promise.all(slots.map(async ({ url, available, when, name }) => {
        const text = available > 1 ? `Salut ${profile.name}. ${available} doses sont disponnibles le ${when} à ${name}` : `${available} dose est disponnible le ${when} à ${name}`;
        await Promise.all(usedDevices.map(async ({ iden }) => {
            await link(iden, 'Vaccin Check', url, text)
        }));
    }));
}

async function notifyEmail(profile, slots) {
    const transport = getEmailTransport();
    const mailBody = slots.reduce((body, { url, available, when, name }) => {
        const text = `
${(available > 1 ? `${available} doses sont disponnibles le ${when} à ${name}` : `${available} dose est disponnible le ${when} à ${name}.`)}
Utilisez le lien suivant pour prendre rendez-vous ${url}.

`;
        return `${body}${text}`;
    }, `Salut ${profile.name}.`);


    await transport.sendMail({
        from: config.email.user,
        to: profile.notify.destinator,
        subject: `Des doses sont disponnibles à ${slots.map(({name}) => name).join(', ')}`,
        text: `${mailBody}

à bientôt.`
    });
}

const typeFilter = ({ name }) => {
    const checkedName = name.toLocaleLowerCase();
    return checkedName.includes('pfizer');
}

async function main() {
    const profiles = require('./profiles.json');
    const uniqCenters = [...new Set(profiles.map(({ places }) => places).flat())];
    const availability = await getAvailabilityMap(uniqCenters, typeFilter);
    const slots = availability;//.filter(({ available }) => available > 0);
    if(slots.length) {
        console.table(slots);
        console.info('Notifying according to profiles');
        await Promise.all(profiles.map(async (profile) => {
            if (!profile.notify) {
                return console.warn(`Notification profile ${profile.name} has no notification config`);
            }
            const slotsToNotify = slots.filter(({ id }) => profile.places.includes(id));
            switch (profile.notify.type) {
                case 'pushbullet':
                    return notifyPushBullet(profile, slotsToNotify);
                case 'email':
                    return notifyEmail(profile, slotsToNotify);
                default:
                    return console.warn(`Notification profile ${profile.name} has uses a non implemented notification ${profile.notify.type}`);
            }
        }));
    } else {
        console.info('Nothing found yet, please try again later.');
    }
}

main().catch(e => console.error(e)); // A commenter pour un usage Lambda

exports.handler = async () => {
    await main();
};