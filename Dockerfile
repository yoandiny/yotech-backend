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

# Exposer le port sur lequel l'application s'exécute
EXPOSE 3001

# Commande pour démarrer l'application
CMD ["npm", "start"]
