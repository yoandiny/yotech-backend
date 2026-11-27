export const CONTRACT_TYPES = [
  {
    id: 'prestation_services',
    label: 'Prestation de services',
    description: 'Réalisation d’un projet digital, livrables et paiement.',
    outline: ['Objet', 'Prestations', 'Livrables', 'Durée et lieu', 'Prix et paiement', 'Obligations des parties', 'Propriété intellectuelle', 'Garantie', 'Confidentialité', 'Résiliation', 'Droit applicable']
  },
  {
    id: 'nda',
    label: 'Accord de confidentialité',
    description: 'Protection des informations échangées entre les parties.',
    outline: ['Objet', 'Définitions', 'Informations confidentielles', 'Obligations', 'Durée', 'Exceptions', 'Restitution', 'Droit applicable']
  },
  {
    id: 'partenariat',
    label: 'Partenariat',
    description: 'Collaboration commerciale ou technique entre parties.',
    outline: ['Objet', 'Rôles des parties', 'Apports', 'Gouvernance', 'Durée', 'Exclusivité', 'Résiliation', 'Droit applicable']
  },
  {
    id: 'maintenance',
    label: 'Maintenance et support',
    description: 'Suivi, correctifs et assistance après livraison.',
    outline: ['Objet', 'Périmètre', 'Niveaux de service', 'Durée', 'Prix', 'Obligations', 'Limites', 'Résiliation', 'Droit applicable']
  },
  {
    id: 'licence',
    label: 'Licence / cession de logiciel',
    description: 'Droit d’usage ou cession d’un logiciel ou d’un code.',
    outline: ['Objet', 'Étendue de la licence', 'Restrictions', 'Prix', 'Propriété intellectuelle', 'Garantie', 'Résiliation', 'Droit applicable']
  },
  {
    id: 'autre',
    label: 'Autre contrat',
    description: 'Tout autre engagement, hors modèle de prestation.',
    outline: ['Objet', 'Engagements', 'Durée', 'Contrepartie', 'Confidentialité', 'Résiliation', 'Droit applicable']
  }
];

export const getContractType = (id) =>
  CONTRACT_TYPES.find((item) => item.id === id) || CONTRACT_TYPES[0];
