FROM nodered/node-red

WORKDIR /data
RUN openssl genrsa -out privkey.pem 2048
RUN openssl req -new -sha256 -key privkey.pem -out csr.pem -subj "/C=FR/ST=Nancy/L=Nancy/O=SaaShup/OU=Netbox/CN=localhost"
RUN openssl x509 -req -in csr.pem -signkey privkey.pem -out cert.pem

WORKDIR /usr/src/node-red
RUN npm install --unsafe-perm --no-update-notifier --no-fund --omit=dev
COPY package.json /usr/src/node-red

COPY flows.json /usr/src/node-red/flows.json
ENV FLOWS=/usr/src/node-red/flows.json

COPY --chown=node-red:node-red settings.js /data/settings.js
COPY --chown=node-red:node-red config.js /data/config.js
