/***
Copyright © 2021 David Balan

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the “Software”), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
***/

const axios = require('axios');
const day = require('dayjs');
const pushBullet = require('pushbullet');
const { promisify } = require('util');

const PUSH_BULLET_TOKEN = 'YOUR_TOKEN';
const CENTERS = [
    {
        "name": "centre-de-vaccination-covid-19-chantepie",
        "url": "https://partners.doctolib.fr/centre-de-sante/chantepie/centre-de-vaccination-covid-19-chantepie"
    },
    {
        "name": "centre-de-vaccination-de-saint-gregoire",
        "url": "https://partners.doctolib.fr/centre-de-sante/saint-gregoire/centre-de-vaccination-de-saint-gregoire"
    },
    {
        "name": "centre-de-vaccination-covid-19-vaccimobile-35-ars-communes-ile-et-vilaine",
        "url": "https://partners.doctolib.fr/centre-de-sante/ile-et-vilaine/centre-de-vaccination-covid-19-vaccimobile-35-ars-communes-ile-et-vilaine"
    },
    {
        "name": "centre-de-vaccination-parc-expo-bruz",
        "url": "https://partners.doctolib.fr/centre-de-sante/bruz/centre-de-vaccination-parc-expo-bruz"
    },
    {
        "name": "centre-de-vaccination-covid-19-de-la-cpts-de-bretagne-romantique",
        "url": "https://partners.doctolib.fr/centre-de-sante/combourg/centre-de-vaccination-covid-19-de-la-cpts-de-bretagne-romantique"
    },
    {
        "name": "centre-de-vaccination-covid-19-de-liffre",
        "url": "https://partners.doctolib.fr/centre-de-sante/liffre/centre-de-vaccination-covid-19-de-liffre"
    },
    {
        "name": "centre-de-vaccination-covid-19-rennes-liberte",
        "url": "https://partners.doctolib.fr/centre-de-vaccinations-internationales/rennes/centre-de-vaccination-covid-19-rennes-liberte"
    },
    {
        "name": "centre-de-vaccination-covid-19-sos-medecins-rennes",
        "url": "https://partners.doctolib.fr/centre-de-sante/rennes/centre-de-vaccination-covid-19-sos-medecins-rennes"
    },
    {
        "name": "centre-de-vaccination-covid-chateaubriant",
        "url": "https://partners.doctolib.fr/cabinet-medical/chateaubriant/centre-de-vaccination-covid-chateaubriant"
    },
    {
        "name": "centre-de-vaccination-de-fougeres",
        "url": "https://partners.doctolib.fr/centre-de-sante/fougeres/centre-de-vaccination-de-fougeres"
    },
    {
        "name": "centre-de-vaccination-de-fougeres",
        "url": "https://partners.doctolib.fr/centre-de-sante/fougeres/centre-de-vaccination-de-fougeres"
    }
];

async function getCenterInformation(centerSlug) {
    const { data: { data: center } } = await axios.get(`https://partners.doctolib.fr/booking/${centerSlug}.json`);
    return {
        centerId: center.profile.id,
        visitMotives: center.visit_motives.map(({ id, name }) => ({ id, name })),
        agendas: center.agendas.map(({ id, visit_motive_ids, practice_id }) => ({ id, visitMotives: visit_motive_ids, place: practice_id })),
        name: center.profile.name_with_title,
    }
}

async function getAvailableTomorrowForCenter(centerInfo, date) {
    if (centerInfo.visitMotives.length === 0) {
        return null;
    }
    const tomorrow = (date ? day(date) : day()).format('YYYY-MM-DD');
    const { data } = await axios.get(`https://partners.doctolib.fr/availabilities.json?start_date=${tomorrow}&visit_motive_ids=${centerInfo.visitMotives.map(({ id }) => id).join('-')}&agenda_ids=${centerInfo.agendas.map(({ id }) => id).join('-')}&insurance_sector=public&practice_ids=${centerInfo.agendas.map(({ place }) => place).join('-')}&destroy_temporary=true&limit=10`);

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
    return await Promise.all(centers.map(async ({ name, url }) => {
        const centerInfo = applyFilterVisitMotives(await getCenterInformation(name), filter);
        const result = await getAvailableTomorrowForCenter(centerInfo);
        return {
            available: result ? result.slots.length : 0,
            name: centerInfo.name,
            slug: name,
            when: result ? result.date : '',
            url,
        };
    }));
}
async function notify(places) {
    const bullet = new pushBullet(PUSH_BULLET_TOKEN);
    const getDevices = promisify(bullet.devices.bind(bullet));
    const link = promisify(bullet.link.bind(bullet));
    const { devices } = await getDevices({ limit: 5 });
    const usedDevices = devices.filter(({ nickname, pushable }) => pushable && !nickname.includes('Jeedom'));
    await Promise.all(places.map(async ({ url, available, when, name }) => {
        const text = available > 1 ? `${available} doses sont disponnibles le ${when} à ${name}` : `${available} dose est disponnible le ${when} à ${name}`;
        console.log('Vaccin Check', url, text)
        await Promise.all(usedDevices.map(async ({ iden }) => {
            await link(iden, 'Vaccin Check', url, text)
        }));
    }));
}

const typeFilter = ({ name }) => {
    const checkedName = name.toLocaleLowerCase();
    return checkedName.includes('pfizer');
}

async function main() {
    const availability = await getAvailabilityMap(CENTERS, typeFilter);
    const places = availability.filter(({ available }) => available > 0);
    if (places.length > 0) {
        notify(places);
    }
}

main().catch(e => console.error(e));