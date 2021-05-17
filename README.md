# CovidCheck

Trouve un rendez-vous covid près de chez vous et vous notifie via PushBullet.

## Get it

```bash
git clone https://gist.github.com/27c19dc989a7f87eda4fd54f4523afb4.git covidcheck
cd covidcheck
npm i
```

## Configure and run

- Commencez par personnaliser la liste des centres `CENTERS` avec ceux autours de chez vous.
- Configurez votre `PUSH_BULLET_TOKEN`.
- Pensez a mofifier la fonction `typeFilter` pour filtrer correctement sur le type de vaccin souhaité.
- `npm run start`

## AWS Lambda

- `npm run build`

## Context

Ce code a été embarqué dans une Lambda AWS et avec un CRON Cloud Watch régulier afin de détecter et réagir au plus vite sur les disponnibilité de vaccin.