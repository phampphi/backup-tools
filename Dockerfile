FROM node:16-alpine

WORKDIR /usr/src/app

COPY ./dist/index.js .

CMD [ "node", "index.js" ]