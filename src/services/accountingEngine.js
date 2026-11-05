const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;

export const money = round2;

export class AccountingError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
    this.name = 'AccountingError';
  }
}

export const lineAmount = (line) => {
  const debit = round2(line.debit);
  const credit = round2(line.credit);
  return { debit, credit };
};

export const totalsOf = (lines = []) => {
  return lines.reduce((acc, line) => {
    const { debit, credit } = lineAmount(line);
    acc.debit = round2(acc.debit + debit);
    acc.credit = round2(acc.credit + credit);
    return acc;
  }, { debit: 0, credit: 0 });
};

export const validateLines = (lines = []) => {
  if (!Array.isArray(lines) || lines.length < 2) {
    throw new AccountingError('Une écriture doit contenir au moins deux lignes.');
  }

  lines.forEach((line, index) => {
    const { debit, credit } = lineAmount(line);
    if (!line.account_id && !line.account_code) {
      throw new AccountingError(`Ligne ${index + 1} : compte comptable obligatoire.`);
    }
    if (debit < 0 || credit < 0) {
      throw new AccountingError(`Ligne ${index + 1} : les montants ne peuvent pas être négatifs.`);
    }
    if (debit > 0 && credit > 0) {
      throw new AccountingError(`Ligne ${index + 1} : une ligne ne peut pas être à la fois débitée et créditée.`);
    }
    if (debit === 0 && credit === 0) {
      throw new AccountingError(`Ligne ${index + 1} : saisir un débit ou un crédit.`);
    }
  });

  const totals = totalsOf(lines);
  const difference = round2(totals.debit - totals.credit);
  if (difference !== 0) {
    throw new AccountingError(
      `Écriture déséquilibrée (débit ${totals.debit.toFixed(2)} / crédit ${totals.credit.toFixed(2)}, écart ${difference.toFixed(2)}).`
    );
  }
  return totals;
};

export const assertPeriodWritable = (period) => {
  if (!period) throw new AccountingError('Aucun exercice comptable pour cette date.', 400);
  if (period.status === 'closed' || period.status === 'locked') {
    throw new AccountingError('Impossible d’écrire dans un exercice clôturé ou verrouillé.', 409);
  }
  if (period.status === 'draft') {
    throw new AccountingError('Ouvrez l’exercice avant de comptabiliser des écritures.', 409);
  }
};

export const assertEntryMutable = (entry) => {
  if (!entry) throw new AccountingError('Écriture introuvable.', 404);
  if (entry.status === 'posted' || entry.status === 'locked' || entry.status === 'reversed') {
    throw new AccountingError('Une écriture comptabilisée ne peut pas être modifiée. Utilisez une contre-passation.', 409);
  }
};

export const reversedLines = (lines = []) => lines.map((line) => ({
  account_id: line.account_id,
  debit: round2(line.credit),
  credit: round2(line.debit),
  label: line.label,
  party_type: line.party_type,
  party_id: line.party_id
}));

export const progressiveBalance = (rows = [], nature = 'debit') => {
  let balance = 0;
  return rows.map((row) => {
    const debit = round2(row.debit);
    const credit = round2(row.credit);
    balance = round2(nature === 'credit' ? balance + credit - debit : balance + debit - credit);
    return { ...row, debit, credit, running_balance: balance };
  });
};

export const splitBalance = (debit, credit) => {
  const net = round2(debit - credit);
  return {
    debit_total: round2(debit),
    credit_total: round2(credit),
    debit_balance: net > 0 ? net : 0,
    credit_balance: net < 0 ? round2(-net) : 0
  };
};

export const buildStatement = (rows, structures, reportType) => {
  const layout = structures.filter((item) => item.report_type === reportType);
  const byKey = new Map();
  rows.forEach((row) => {
    const key = row.mapping_key;
    const current = byKey.get(key) || { debit: 0, credit: 0 };
    current.debit = round2(current.debit + Number(row.debit || 0));
    current.credit = round2(current.credit + Number(row.credit || 0));
    byKey.set(key, current);
  });

  const sections = [];
  layout.forEach((item) => {
    let section = sections.find((s) => s.code === item.section_code);
    if (!section) {
      section = { code: item.section_code, label: item.section_label, groups: [], total: 0 };
      sections.push(section);
    }
    const amounts = byKey.get(item.mapping_key) || { debit: 0, credit: 0 };
    const net = item.section_code === 'ASSET' || item.section_code === 'EXPENSE'
      ? round2(amounts.debit - amounts.credit)
      : round2(amounts.credit - amounts.debit);
    section.groups.push({
      mapping_key: item.mapping_key,
      label: item.group_label,
      amount: net
    });
    section.total = round2(section.total + net);
  });
  return sections;
};
