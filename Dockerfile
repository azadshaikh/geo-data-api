FROM node:22-alpine AS builder

WORKDIR /app

# The generator uses only Node's built-in modules; no production install is needed.
COPY package.json package-lock.json README.md openapi.json index.html 404.html ./
COPY src/ ./src/
COPY scripts/ ./scripts/
COPY schemas/ ./schemas/
COPY types/ ./types/
COPY db/ ./db/
COPY playground/ ./playground/
COPY docs/ ./docs/

RUN npm run build

# The generator stages the API in a private temporary directory. Allow the
# unprivileged runtime user to traverse the finished static output.
RUN chmod a+rx /app/dist/api/v2

# Keep the license alongside generated files when inspecting the npm package
# from the builder stage.
COPY LICENSE ./

FROM node:22-alpine AS runtime

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000
WORKDIR /app

COPY --from=builder /app/dist/ ./dist/
COPY --from=builder /app/src/server.js ./src/server.js

USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD ["node", "-e", "require('node:http').get('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/v2/api-info.json',r=>{r.resume();process.exit(r.statusCode===200?0:1)}).on('error',()=>process.exit(1))"]

CMD ["node", "src/server.js"]
