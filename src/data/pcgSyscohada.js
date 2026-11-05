/** Référentiel SYSCOHADA (PCG applicable à Madagascar / espace OHADA).
 *  Les états financiers s’appuient sur mapping_key, jamais sur le code compte. */

export const SYSCOHADA_STANDARD = {
  code: 'SYSCOHADA',
  name: 'SYSCOHADA — Plan comptable OHADA',
  country: 'MG'
};

export const SYSCOHADA_VERSION = {
  code: 'SYSCOHADA-2017',
  name: 'Révisé 2017 (applicable Madagascar)',
  valid_from: '2018-01-01'
};

export const REPORT_STRUCTURES = [
  { report_type: 'balance', section_code: 'ASSET', section_label: 'Actif', mapping_key: 'ASSET_FIXED', sort_order: 10, group_label: 'Immobilisations' },
  { report_type: 'balance', section_code: 'ASSET', section_label: 'Actif', mapping_key: 'ASSET_INVENTORY', sort_order: 20, group_label: 'Stocks' },
  { report_type: 'balance', section_code: 'ASSET', section_label: 'Actif', mapping_key: 'ASSET_RECEIVABLE', sort_order: 30, group_label: 'Créances' },
  { report_type: 'balance', section_code: 'ASSET', section_label: 'Actif', mapping_key: 'ASSET_CASH', sort_order: 40, group_label: 'Trésorerie' },
  { report_type: 'balance', section_code: 'EQUITY', section_label: 'Capitaux propres', mapping_key: 'EQUITY', sort_order: 50, group_label: 'Capitaux propres' },
  { report_type: 'balance', section_code: 'LIABILITY', section_label: 'Dettes', mapping_key: 'LIABILITY_FINANCIAL', sort_order: 60, group_label: 'Dettes financières' },
  { report_type: 'balance', section_code: 'LIABILITY', section_label: 'Dettes', mapping_key: 'LIABILITY_CURRENT', sort_order: 70, group_label: 'Dettes d’exploitation' },
  { report_type: 'pnl', section_code: 'INCOME', section_label: 'Produits', mapping_key: 'INCOME_OPERATING', sort_order: 10, group_label: 'Produits d’exploitation' },
  { report_type: 'pnl', section_code: 'INCOME', section_label: 'Produits', mapping_key: 'INCOME_FINANCIAL', sort_order: 20, group_label: 'Produits financiers' },
  { report_type: 'pnl', section_code: 'INCOME', section_label: 'Produits', mapping_key: 'INCOME_EXTRA', sort_order: 30, group_label: 'Produits HAO' },
  { report_type: 'pnl', section_code: 'EXPENSE', section_label: 'Charges', mapping_key: 'EXPENSE_OPERATING', sort_order: 40, group_label: 'Charges d’exploitation' },
  { report_type: 'pnl', section_code: 'EXPENSE', section_label: 'Charges', mapping_key: 'EXPENSE_PERSONNEL', sort_order: 50, group_label: 'Charges de personnel' },
  { report_type: 'pnl', section_code: 'EXPENSE', section_label: 'Charges', mapping_key: 'EXPENSE_FINANCIAL', sort_order: 60, group_label: 'Charges financières' },
  { report_type: 'pnl', section_code: 'EXPENSE', section_label: 'Charges', mapping_key: 'EXPENSE_EXTRA', sort_order: 70, group_label: 'Charges HAO' }
];

const acc = (code, name, mapping_key, extras = {}) => ({
  code,
  name,
  mapping_key,
  parent_code: extras.parent_code || null,
  balance_nature: extras.balance_nature || (mapping_key.startsWith('INCOME') || mapping_key.startsWith('LIABILITY') || mapping_key === 'EQUITY' ? 'credit' : 'debit'),
  is_postable: extras.is_postable !== false,
  auxiliary_type: extras.auxiliary_type || null,
  treasury_kind: extras.treasury_kind || null
});

export const SYSCOHADA_ACCOUNTS = [
  acc('1', 'Comptes de ressources durables', 'EQUITY', { is_postable: false }),
  acc('10', 'Capital', 'EQUITY', { parent_code: '1', is_postable: false }),
  acc('101', 'Capital social', 'EQUITY', { parent_code: '10' }),
  acc('11', 'Réserves', 'EQUITY', { parent_code: '1', is_postable: false }),
  acc('111', 'Réserve légale', 'EQUITY', { parent_code: '11' }),
  acc('12', 'Report à nouveau', 'EQUITY', { parent_code: '1' }),
  acc('13', 'Résultat net de l’exercice', 'EQUITY', { parent_code: '1' }),
  acc('16', 'Emprunts et dettes assimilées', 'LIABILITY_FINANCIAL', { parent_code: '1', is_postable: false }),
  acc('161', 'Emprunts auprès des établissements de crédit', 'LIABILITY_FINANCIAL', { parent_code: '16' }),

  acc('2', 'Comptes d’actif immobilisé', 'ASSET_FIXED', { is_postable: false }),
  acc('21', 'Immobilisations incorporelles', 'ASSET_FIXED', { parent_code: '2', is_postable: false }),
  acc('211', 'Frais de développement', 'ASSET_FIXED', { parent_code: '21' }),
  acc('22', 'Terrains', 'ASSET_FIXED', { parent_code: '2' }),
  acc('23', 'Bâtiments, installations techniques et agencements', 'ASSET_FIXED', { parent_code: '2' }),
  acc('24', 'Matériel', 'ASSET_FIXED', { parent_code: '2', is_postable: false }),
  acc('244', 'Matériel et mobilier de bureau', 'ASSET_FIXED', { parent_code: '24' }),
  acc('245', 'Matériel informatique', 'ASSET_FIXED', { parent_code: '24' }),
  acc('26', 'Titres de participation', 'ASSET_FIXED', { parent_code: '2' }),
  acc('28', 'Amortissements des immobilisations', 'ASSET_FIXED', { parent_code: '2', balance_nature: 'credit' }),

  acc('3', 'Comptes de stocks', 'ASSET_INVENTORY', { is_postable: false }),
  acc('31', 'Marchandises', 'ASSET_INVENTORY', { parent_code: '3' }),
  acc('32', 'Matières premières et fournitures', 'ASSET_INVENTORY', { parent_code: '3' }),

  acc('4', 'Comptes de tiers', 'ASSET_RECEIVABLE', { is_postable: false }),
  acc('40', 'Fournisseurs et comptes rattachés', 'LIABILITY_CURRENT', { parent_code: '4', is_postable: false }),
  acc('401', 'Fournisseurs', 'LIABILITY_CURRENT', { parent_code: '40', auxiliary_type: 'supplier' }),
  acc('409', 'Fournisseurs débiteurs', 'ASSET_RECEIVABLE', { parent_code: '40' }),
  acc('41', 'Clients et comptes rattachés', 'ASSET_RECEIVABLE', { parent_code: '4', is_postable: false }),
  acc('411', 'Clients', 'ASSET_RECEIVABLE', { parent_code: '41', auxiliary_type: 'client' }),
  acc('419', 'Clients créditeurs', 'LIABILITY_CURRENT', { parent_code: '41' }),
  acc('42', 'Personnel', 'LIABILITY_CURRENT', { parent_code: '4' }),
  acc('421', 'Personnel, rémunérations dues', 'LIABILITY_CURRENT', { parent_code: '42' }),
  acc('43', 'Organismes sociaux', 'LIABILITY_CURRENT', { parent_code: '4' }),
  acc('431', 'CNaPS', 'LIABILITY_CURRENT', { parent_code: '43' }),
  acc('44', 'État et collectivités publiques', 'LIABILITY_CURRENT', { parent_code: '4', is_postable: false }),
  acc('441', 'État, impôts sur les bénéfices', 'LIABILITY_CURRENT', { parent_code: '44' }),
  acc('445', 'État, TVA facturée', 'LIABILITY_CURRENT', { parent_code: '44' }),
  acc('4456', 'État, TVA récupérable', 'ASSET_RECEIVABLE', { parent_code: '44' }),
  acc('46', 'Associés et groupe', 'LIABILITY_CURRENT', { parent_code: '4' }),
  acc('47', 'Débiteurs et créditeurs divers', 'ASSET_RECEIVABLE', { parent_code: '4' }),

  acc('5', 'Comptes de trésorerie', 'ASSET_CASH', { is_postable: false }),
  acc('52', 'Banques', 'ASSET_CASH', { parent_code: '5', is_postable: false }),
  acc('521', 'Banques locales', 'ASSET_CASH', { parent_code: '52', treasury_kind: 'bank' }),
  acc('53', 'Établissements financiers', 'ASSET_CASH', { parent_code: '5' }),
  acc('57', 'Caisse', 'ASSET_CASH', { parent_code: '5', treasury_kind: 'cash' }),

  acc('6', 'Comptes de charges des activités ordinaires', 'EXPENSE_OPERATING', { is_postable: false }),
  acc('60', 'Achats et variations de stocks', 'EXPENSE_OPERATING', { parent_code: '6', is_postable: false }),
  acc('601', 'Achats de marchandises', 'EXPENSE_OPERATING', { parent_code: '60' }),
  acc('604', 'Achats de matières et fournitures consommables', 'EXPENSE_OPERATING', { parent_code: '60' }),
  acc('61', 'Transports', 'EXPENSE_OPERATING', { parent_code: '6' }),
  acc('62', 'Services extérieurs A', 'EXPENSE_OPERATING', { parent_code: '6', is_postable: false }),
  acc('622', 'Locations et charges locatives', 'EXPENSE_OPERATING', { parent_code: '62' }),
  acc('624', 'Entretien, réparations et maintenance', 'EXPENSE_OPERATING', { parent_code: '62' }),
  acc('625', 'Primes d’assurance', 'EXPENSE_OPERATING', { parent_code: '62' }),
  acc('627', 'Publicité, publications, relations publiques', 'EXPENSE_OPERATING', { parent_code: '62' }),
  acc('628', 'Frais de télécommunications', 'EXPENSE_OPERATING', { parent_code: '62' }),
  acc('63', 'Services extérieurs B', 'EXPENSE_OPERATING', { parent_code: '6', is_postable: false }),
  acc('631', 'Frais bancaires', 'EXPENSE_OPERATING', { parent_code: '63' }),
  acc('632', 'Rémunérations d’intermédiaires et de conseils', 'EXPENSE_OPERATING', { parent_code: '63' }),
  acc('633', 'Frais de formation', 'EXPENSE_OPERATING', { parent_code: '63' }),
  acc('64', 'Impôts et taxes', 'EXPENSE_OPERATING', { parent_code: '6' }),
  acc('66', 'Charges de personnel', 'EXPENSE_PERSONNEL', { parent_code: '6', is_postable: false }),
  acc('661', 'Rémunérations directes versées au personnel national', 'EXPENSE_PERSONNEL', { parent_code: '66' }),
  acc('664', 'Charges sociales', 'EXPENSE_PERSONNEL', { parent_code: '66' }),
  acc('67', 'Frais financiers et charges assimilées', 'EXPENSE_FINANCIAL', { parent_code: '6' }),
  acc('68', 'Dotations aux amortissements', 'EXPENSE_OPERATING', { parent_code: '6' }),
  acc('69', 'Charges HAO', 'EXPENSE_EXTRA', { parent_code: '6' }),

  acc('7', 'Comptes de produits des activités ordinaires', 'INCOME_OPERATING', { is_postable: false }),
  acc('70', 'Ventes', 'INCOME_OPERATING', { parent_code: '7', is_postable: false }),
  acc('701', 'Ventes de marchandises', 'INCOME_OPERATING', { parent_code: '70' }),
  acc('704', 'Ventes de services', 'INCOME_OPERATING', { parent_code: '70' }),
  acc('705', 'Travaux facturés', 'INCOME_OPERATING', { parent_code: '70' }),
  acc('706', 'Services vendus (prestations informatiques)', 'INCOME_OPERATING', { parent_code: '70' }),
  acc('75', 'Autres produits', 'INCOME_OPERATING', { parent_code: '7' }),
  acc('77', 'Revenus financiers et produits assimilés', 'INCOME_FINANCIAL', { parent_code: '7' }),
  acc('79', 'Produits HAO', 'INCOME_EXTRA', { parent_code: '7' })
];

export const DEFAULT_JOURNALS = [
  { code: 'VTE', name: 'Journal des ventes', journal_type: 'sales' },
  { code: 'ACH', name: 'Journal des achats', journal_type: 'purchases' },
  { code: 'BQ', name: 'Journal de banque', journal_type: 'bank' },
  { code: 'CAI', name: 'Journal de caisse', journal_type: 'cash' },
  { code: 'OD', name: 'Journal des opérations diverses', journal_type: 'miscellaneous' }
];

export const ENTRY_TEMPLATES = [
  { code: 'CUST_PAY', name: 'Encaissement client', journal_code: 'BQ' },
  { code: 'SUPP_PAY', name: 'Paiement fournisseur', journal_code: 'BQ' },
  { code: 'BANK_EXP', name: 'Dépense bancaire', journal_code: 'BQ' },
  { code: 'SALARY', name: 'Paiement de salaire', journal_code: 'BQ' },
  { code: 'MISC', name: 'Opération diverse', journal_code: 'OD' }
];
