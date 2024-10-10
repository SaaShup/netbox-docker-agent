FROM nodered/node-red:4.0.1-minimal

WORKDIR /data
RUN openssl genrsa -out privkey.pem 2048
RUN openssl req -new -sha256 -key privkey.pem -out csr.pem -subj "/C=FR/ST=Nancy/L=Nancy/O=SaaShup/OU=Netbox/CN=localhost"
RUN openssl x509 -req -in csr.pem -signkey privkey.pem -out cert.pem

WORKDIR /usr/src/node-red
COPY package.json /usr/src/node-red
RUN ln -s /usr/src/node-red/package.json /data/package.json

COPY --chown=node-red:node-red public /usr/src/node-red/public
COPY --chown=node-red:node-red flows.json /usr/src/node-red/flows.json

ENV FLOWS=/usr/src/node-red/flows.json
ENV DATAPATH=/data
ENV APPPATH=/usr/src/node-red

COPY --chown=node-red:node-red settings.js config.js registries.js /data
