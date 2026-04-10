import { FinanceModel } from '../models/financeModel.js';
import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';

export const getStats = async (req, res) => {
  try {
    const { year, startDate, endDate } = req.query;
    const currentYear = year || new Date().getFullYear();
    
    const [stats, overallStats, recentTransactions] = await Promise.all([
      FinanceModel.getStats(currentYear, startDate, endDate),
      FinanceModel.getOverallStats(),
      FinanceModel.getRecentTransactions(10, currentYear)
    ]);

    res.json({
      stats: {
        totalIncome: parseFloat(stats.total_income || 0),
        totalExpenses: parseFloat(stats.total_expenses || 0),
        netProfit: parseFloat(stats.net_profit || 0)
      },
      overallStats: {
        totalIncome: parseFloat(overallStats.total_income || 0),
        totalExpenses: parseFloat(overallStats.total_expenses || 0),
        netProfit: parseFloat(overallStats.net_profit || 0)
      },
      recentTransactions
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

export const getChartData = async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const data = await FinanceModel.getChartData(days);
    const formattedData = data.map(row => ({
      date: new Date(row.date).toISOString().split('T')[0],
      income: parseFloat(row.income),
      expense: parseFloat(row.expense)
    }));
    res.json(formattedData);
  } catch (error) {
    console.error('Error fetching chart data:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

export const createTransaction = async (req, res) => {
  try {
    const transaction = await FinanceModel.addTransaction(req.body);
    res.status(201).json(transaction);
  } catch (error) {
    console.error('Error creating transaction:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

export const getHistory = async (req, res) => {
  try {
    const { month, year } = req.query;
    const history = await FinanceModel.getHistory(month, year);
    res.json(history);
  } catch (error) {
    console.error('Error fetching history:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

export const getGoal = async (req, res) => {
  try {
    const year = parseInt(req.query.year) || new Date().getFullYear();
    const goal = await FinanceModel.getGoal(year);
    res.json(goal || { year, goal_amount: 0 });
  } catch (error) {
    console.error('Error fetching goal:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

export const setGoal = async (req, res) => {
  try {
    const { year, goal_amount } = req.body;
    const goal = await FinanceModel.setGoal(year, goal_amount);
    res.json(goal);
  } catch (error) {
    console.error('Error setting goal:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

export const getSettings = async (req, res) => {
  try {
    const settings = await FinanceModel.getSettings();
    res.json(settings);
  } catch (error) {
    console.error('Error fetching settings:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

export const updateSettings = async (req, res) => {
  try {
    const settings = await FinanceModel.updateSettings(req.body);
    res.json(settings);
  } catch (error) {
    console.error('Error updating settings:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

export const generateInvoiceNumber = async (req, res) => {
  try {
    const invoiceNumber = await FinanceModel.generateInvoiceNumber();
    res.json({ invoice_number: invoiceNumber });
  } catch (error) {
    console.error('Error generating invoice number:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

export const invoiceTransaction = async (req, res) => {
  try {
    const { id } = req.params;
    const invoiceData = req.body;
    
    const transaction = await FinanceModel.getTransactionById(id);
    if (!transaction) {
      return res.status(404).json({ error: 'Transaction introuvable' });
    }
    if (transaction.type_transaction !== 'revenu') {
      return res.status(400).json({ error: 'Seules les transactions de type revenu peuvent être facturées' });
    }

    const settings = await FinanceModel.getSettings();
    if (invoiceData.tax_rate == null) {
      invoiceData.tax_rate = settings.tax_rate || 0;
    }
    if (!invoiceData.invoice_number) {
      invoiceData.invoice_number = await FinanceModel.generateInvoiceNumber();
    }

    const invoice = await FinanceModel.invoiceTransaction(id, invoiceData);
    res.json(invoice);
  } catch (error) {
    console.error('Error creating invoice from transaction:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

export const generateInvoicePDF = async (req, res) => {
  try {
    const { id } = req.params;

    const transactionResult = await FinanceModel.getTransactionById(id);
    if (!transactionResult || !transactionResult.is_invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    const transaction = transactionResult;
    const settings = await FinanceModel.getSettings();

    const doc = new PDFDocument({
      size: 'A4',
      margin: 40
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=facture-${transaction.invoice_number}.pdf`);

    doc.pipe(res);

    const companyName = settings.company_name || 'Votre Entreprise';
    const companyAddress = settings.company_address || '';
    const companyNIF = settings.company_nif ? `NIF: ${settings.company_nif}` : '';
    const companySTAT = settings.company_stat ? `STAT: ${settings.company_stat}` : '';
    const companyEmail = settings.company_email ? `Email: ${settings.company_email}` : '';
    const companyPhone = settings.company_phone ? `Tél: ${settings.company_phone}` : '';

    const invoiceDate = new Date(transaction.date_transaction).toLocaleDateString('fr-FR');
    const dueDate = transaction.due_date ? new Date(transaction.due_date).toLocaleDateString('fr-FR') : '';
    const description = transaction.description || 'Service facturé';
    const amountHT = parseFloat(transaction.amount || 0);
    const taxAmount = parseFloat(transaction.tax_amount || 0);
    const totalAmount = parseFloat(transaction.total_amount || amountHT + taxAmount);
    const taxRate = parseFloat(transaction.tax_rate || 0);

    // Header block
    doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(24).text('FACTURE', { align: 'right' });
    doc.moveDown(0.2);
    doc.font('Helvetica').fontSize(10).fillColor('#475569');
    doc.text(`Facture n° ${transaction.invoice_number}`, { align: 'right' });
    doc.text(`Date : ${invoiceDate}`, { align: 'right' });
    if (dueDate) doc.text(`Échéance : ${dueDate}`, { align: 'right' });

    doc.moveDown(1.5);

    const contentStart = doc.y;
    doc.fontSize(11).fillColor('#0f172a').font('Helvetica-Bold').text(companyName, 50, contentStart);
    doc.font('Helvetica').fontSize(9).fillColor('#475569');
    if (companyAddress) doc.text(companyAddress);
    if (companyNIF) doc.text(companyNIF);
    if (companySTAT) doc.text(companySTAT);
    if (companyEmail) doc.text(companyEmail);
    if (companyPhone) doc.text(companyPhone);

    const clientX = 320;
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#0f172a').text('Client', clientX, contentStart);
    doc.font('Helvetica').fontSize(9).fillColor('#475569');
    doc.text(transaction.client_name || 'Client', clientX, doc.y);
    if (transaction.client_address) doc.text(transaction.client_address, { width: 220, align: 'left' });
    if (transaction.client_email) doc.text(`Email : ${transaction.client_email}`, clientX);
    if (transaction.client_phone) doc.text(`Tél : ${transaction.client_phone}`, clientX);

    doc.moveDown(2);

    const tableTop = doc.y;
    doc.rect(50, tableTop, 495, 24).fill('#0b5394');
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(10);
    doc.text('Description', 58, tableTop + 7, { width: 220 });
    doc.text('Qté', 288, tableTop + 7, { width: 60, align: 'right' });
    doc.text('Prix HT', 354, tableTop + 7, { width: 90, align: 'right' });
    doc.text('TVA', 450, tableTop + 7, { width: 45, align: 'right' });
    doc.text('Total', 500, tableTop + 7, { width: 45, align: 'right' });

    doc.fillColor('#0f172a').font('Helvetica').fontSize(10);
    const itemY = tableTop + 34;
    doc.text(description, 58, itemY, { width: 220 });
    doc.text('1', 288, itemY, { width: 60, align: 'right' });
    doc.text(`${amountHT.toLocaleString('fr-FR')} Ar`, 354, itemY, { width: 90, align: 'right' });
    doc.text(`${taxRate}%`, 450, itemY, { width: 45, align: 'right' });
    doc.text(`${totalAmount.toLocaleString('fr-FR')} Ar`, 500, itemY, { width: 45, align: 'right' });

    doc.moveDown(5);

    const summaryTop = itemY + 60;
    doc.moveTo(50, summaryTop - 12).lineTo(545, summaryTop - 12).strokeColor('#e2e8f0').stroke();
    doc.font('Helvetica-Bold').fillColor('#0f172a').fontSize(10).text('Total HT', 360, summaryTop);
    doc.font('Helvetica').text(`${amountHT.toLocaleString('fr-FR')} Ar`, 500, summaryTop, { width: 45, align: 'right' });
    doc.font('Helvetica-Bold').text('TVA', 360, summaryTop + 16);
    doc.font('Helvetica').text(`${taxAmount.toLocaleString('fr-FR')} Ar`, 500, summaryTop + 16, { width: 45, align: 'right' });
    doc.font('Helvetica-Bold').fontSize(12).text('Total TTC', 360, summaryTop + 36);
    doc.font('Helvetica').fontSize(12).text(`${totalAmount.toLocaleString('fr-FR')} Ar`, 500, summaryTop + 36, { width: 45, align: 'right' });

    doc.moveDown(6);
    doc.fontSize(9).fillColor('#475569').font('Helvetica');
    doc.text('Merci pour votre confiance. Cette facture est établie conformément à la législation fiscale malgache.', 50, doc.y, {
      width: 495,
      align: 'left'
    });

    doc.end();
  } catch (error) {
    console.error('Error generating invoice PDF:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};
