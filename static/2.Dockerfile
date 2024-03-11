FROM node:20-alpine

LABEL maintainer="Eddy0644 <i@ryancc.top>"

RUN mkdir /bot

WORKDIR /bot

COPY . /bot

RUN npm install

RUN chmod +x /bot/static/3entry.sh
# chmod !!!cd /va
ENTRYPOINT /bot/static/3entry.sh

CMD ["/bot/static/3entry.sh"]