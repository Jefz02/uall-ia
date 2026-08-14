FROM node:22-slim

WORKDIR /app

# Instala dependências nativas (python3/make/g++ para módulos nativos como onnxruntime)
RUN apt-get update && \
    apt-get install -y --no-install-recommends python3 make g++ && \
    rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install --production=false

COPY . .
RUN npm run build && \
    mkdir -p dist/agents/systemPrompts dist/agents/memory && \
    cp src/agents/systemPrompts/systemPrompt.md dist/agents/systemPrompts/systemPrompt.md && \
    cp src/agents/memory/conhecimento.md dist/agents/memory/conhecimento.md

EXPOSE 3000

CMD ["node", "dist/index.js"]
