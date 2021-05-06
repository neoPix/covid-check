const axios = require('axios');
const day = require('dayjs');

async function getCenterInformation (centerSlug) {
    const { data: { data: center } } = await axios.get(`https://partners.doctolib.fr/booking/${centerSlug}.json`);
    return {
        centerId: center.profile.id,
        visitMotives: center.visit_motives.map(({ id, name }) => ({ id, name })),
        agendas: center.agendas.map(({ id, visit_motive_ids }) => ({ id, visitMotives: visit_motive_ids })),
        name: center.profile.name_with_title,
    }
}

async function getAvailableForCenterTomorrow (centerInfo) {
    const tomorrow = day().add(1, 'd');
    const { data: { availabilities } } = await axios.get(`https://partners.doctolib.fr/availabilities.json?start_date=${tomorrow.format('YYYY-MM-DD')}&visit_motive_ids=${centerInfo.visitMotives.map(({ id }) => id).join('-')}&agenda_ids=${centerInfo.agendas.map(({ id }) => id).join('-')}&insurance_sector=public&practice_ids=${centerInfo.centerId}&destroy_temporary=true`);
    if (availabilities.length === 0) {
        return [];
    }
    return availabilities[0].slots;
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

async function getAvailabilityMap (centers, filter) {
    const centerMap = [];
    for (const center of centers) {
        const centerInfo = applyFilterVisitMotives(await getCenterInformation(center), filter);
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
    console.table(await getAvailabilityMap(centers, ({ name }) => name.includes('Pfizer') && ['1re', 'première'].some((w) => name.includes(w))));
}

main().catch(e => console.error(e));