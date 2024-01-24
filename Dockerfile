FROM nodered/node-red

WORKDIR /data

RUN openssl genrsa -out privkey.pem 2048
RUN openssl req -new -sha256 -key privkey.pem -out csr.pem -subj "/C=FR/ST=Nancy/L=Nancy/O=SaaShup/OU=Netbox/CN=localhost"
RUN openssl x509 -req -in csr.pem -signkey privkey.pem -out cert.pem

RUN npm install --unsafe-perm --no-update-notifier --no-fund --omit=dev
WORKDIR /usr/src/node-red
COPY package.json /usr/src/node-red

COPY settings.js /data/settings.js
COPY flows.json /data/flows.json
