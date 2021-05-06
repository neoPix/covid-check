const axios = require('axios');
const day = require('dayjs');

async function getCenterInformation (centerSlug) {
    const { data: { data: center } } = await axios.get(`https://partners.doctolib.fr/booking/${centerSlug}.json`);
    return {
        centerId: center.profile.id,
        visitMotivesIds: center.visit_motives.map(({ id }) => id),
        agendaIds: center.agendas.map(({ id }) => id),
        name: center.profile.name_with_title,
    }
}

async function getAvailableForCenterTomorrow (centerInfo) {
    const tomorrow = day().add(1, 'd');
    const { data: { availabilities } } = await axios.get(`https://partners.doctolib.fr/availabilities.json?start_date=${tomorrow.format('YYYY-MM-DD')}&visit_motive_ids=${centerInfo.visitMotivesIds.join('-')}&agenda_ids=${centerInfo.agendaIds.join('-')}&insurance_sector=public&practice_ids=${centerInfo.centerId}&destroy_temporary=true`);
    if (availabilities.length === 0) {
        return [];
    }
    return availabilities[0].slots;
}

async function getAvailabilityMap (centers) {
    const centerMap = [];
    for (const center of centers) {
        const centerInfo = await getCenterInformation(center);
        const slots = await getAvailableForCenterTomorrow(centerInfo);
        centerMap.push({
            available: slots.length,
            name: centerInfo.name,
        });
    }
    return centerMap;
}

async function main() {
    const centers = [
        'centre-de-vaccination-de-fougeres',
        'centre-de-vaccination-covid-19-vaccimobile-35-ars-communes-ile-et-vilaine',
        'centre-de-vaccination-covid-19-chantepie',
        'ch-d-avranches-granville-centre-de-vaccination-covid'
    ];
    console.table(await getAvailabilityMap(centers));
}

main().catch(e => console.error(e));