# Utiliser une image de base Node.js légère
FROM node:20-slim

# Définir le dossier de travail
WORKDIR /app

# Copier les fichiers de dépendances
COPY package*.json ./

# Installer les dépendances de production
RUN npm install --omit=dev

# Copier le reste du code source
COPY . .

# Définir le port par défaut (peut être surchargé à la construction)
ARG PORT=3001
ENV PORT=${PORT}

# Exposer le port sur lequel l'application s'exécute
EXPOSE ${PORT}

# Commande pour démarrer l'application
CMD ["npm", "start"]
