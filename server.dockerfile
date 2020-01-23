FROM node:lts-alpine

RUN npm install -g pm2

WORKDIR /app

COPY ./server .

RUN npm ci
RUN npm run build:clean

CMD ["npm", "run", "start:docker"]