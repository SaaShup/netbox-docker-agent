FROM node:24-alpine AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

FROM node:24-alpine
ENV NODE_ENV=production DATAPATH=/data PORT=1880
WORKDIR /app
RUN mkdir -p /data && chown node:node /data
COPY --from=dependencies /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
COPY public ./public
COPY entrypoint.sh ./entrypoint.sh
USER node
EXPOSE 1880
VOLUME /data
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/',{headers:{authorization:'Basic '+Buffer.from((process.env.API_USERNAME||'admin')+':'+(process.env.HEALTHCHECK_PASSWORD||'saashup')).toString('base64')}}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
LABEL prometheus_scrape_agent="true" prometheus_address="netbox-docker-agent:1880"
ENTRYPOINT ["./entrypoint.sh"]
