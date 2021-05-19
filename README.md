# CovidCheck

Recherche les RDV disponibles pour plusieurs profiles et les notifient par Email ou PushBullet. Un fichier de profil permet de définir les centres à surveiller pour chaque profil.

## Get it

```bash
git clone https://github.com/neoPix/covid-check.git
cd covid-check
npm i
```

## Configure and run

- Commencez par personnaliser modifier les fichier `profiles.json` avec les profiles de votre choix, leurs modes de notifications...
- Si vous souhaitez envoyer des mails modifier `config.json`.
- Pensez a mofifier la fonction `typeFilter` pour filtrer correctement sur le type de vaccin souhaité. A ce jour un seul filtre est disponnible pour tous les profiles.
- `npm run start`

## AWS Lambda

- `npm run build`
- Take dist.zip
- Entrypoint `main.handler`

## Conception

Ce code a été réalisé en observant le fonctionnement des applications Doctolib. Ce travail se basant uniquement sur de l'observation et les APIs n'étant pas documentés, il est possible que des faux positifs soient détectés.

## Context

Ce code a été embarqué dans une Lambda AWS et avec un CRON Cloud Watch régulier afin de détecter et réagir au plus vite sur les disponibilité de vaccin.