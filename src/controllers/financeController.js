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
      return res.status(400).json({ error: 'Le numéro de facture est obligatoire.' });
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
      margin: 40,
      bufferPages: true
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=facture-${transaction.invoice_number}.pdf`);

    doc.pipe(res);

    const companyName = settings.company_name || 'YoTech Compute';
    const companyAddress = settings.company_address || '101 Antananarivo, Madagascar';
    const companyNIF = settings.company_nif || '1000000000';
    const companySTAT = settings.company_stat || '1000000000';
    const companyEmail = settings.company_email || 'contact@yotech-compute.com';
    const companyPhone = settings.company_phone || '';

    const invoiceDate = new Date(transaction.date_transaction).toLocaleDateString('fr-FR');
    const dueDate = transaction.due_date ? new Date(transaction.due_date).toLocaleDateString('fr-FR') : '';
    const description = transaction.description || 'Service facturé';
    const amountHT = parseFloat(transaction.amount || 0);
    const taxAmount = parseFloat(transaction.tax_amount || 0);
    const totalAmount = parseFloat(transaction.total_amount || amountHT + taxAmount);
    const taxRate = parseFloat(transaction.tax_rate || 0);

    // --- Header ---
    const logoPath = path.join(process.cwd(), 'src', 'assets', 'logo.png');
    if (fs.existsSync(logoPath)) {
      doc.image(logoPath, 40, 35, { width: 100 });
    } else {
      doc.fillColor('#4f46e5').font('Helvetica-Bold').fontSize(24).text('YoTech', 40, 40);
      doc.fontSize(10).text('Compute', 40, 65);
    }

    doc.fillColor('#1e1b4b').font('Helvetica-Bold').fontSize(28).text('FACTURE', 0, 40, { align: 'right' });
    doc.fillColor('#64748b').font('Helvetica-Bold').fontSize(10).text(`N° ${transaction.invoice_number}`, 0, 75, { align: 'right' });
    
    doc.moveDown(2);

    // --- Info Grid ---
    const gridY = 130;
    
    // De:
    doc.fillColor('#4f46e5').font('Helvetica-Bold').fontSize(9).text('ÉMETTEUR', 40, gridY);
    doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(11).text(companyName, 40, gridY + 15);
    doc.fillColor('#475569').font('Helvetica').fontSize(9);
    doc.text(companyAddress, 40, gridY + 30, { width: 200 });
    doc.text(`NIF: ${companyNIF} | STAT: ${companySTAT}`, 40, doc.y + 2);
    if (companyEmail) doc.text(companyEmail, 40, doc.y + 2);

    // À:
    const clientX = 320;
    doc.fillColor('#4f46e5').font('Helvetica-Bold').fontSize(9).text('DESTINATAIRE', clientX, gridY);
    doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(11).text(transaction.client_name || 'Client', clientX, gridY + 15);
    doc.fillColor('#475569').font('Helvetica').fontSize(9);
    if (transaction.client_address) doc.text(transaction.client_address, clientX, doc.y + 2, { width: 220 });
    if (transaction.client_email) doc.text(`Email: ${transaction.client_email}`, clientX, doc.y + 2);
    if (transaction.client_phone) doc.text(`Tél: ${transaction.client_phone}`, clientX, doc.y + 2);

    // Dates:
    const datesY = gridY + 100;
    doc.rect(40, datesY, 515, 40).fill('#f8fafc');
    doc.fillColor('#64748b').font('Helvetica-Bold').fontSize(8).text('DATE D\'ÉMISSION', 60, datesY + 10);
    doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(10).text(invoiceDate, 60, datesY + 22);

    if (dueDate) {
      doc.fillColor('#64748b').font('Helvetica-Bold').fontSize(8).text('DATE D\'ÉCHÉANCE', 220, datesY + 10);
      doc.fillColor('#4f46e5').font('Helvetica-Bold').fontSize(10).text(dueDate, 220, datesY + 22);
    }

    doc.fillColor('#64748b').font('Helvetica-Bold').fontSize(8).text('DEVISE', 450, datesY + 10);
    doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(10).text('Ariary (MGA)', 450, datesY + 22);

    doc.moveDown(4);

    // --- Table ---
    const tableTop = 290;
    doc.rect(40, tableTop, 515, 30).fill('#1e1b4b');
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(9);
    doc.text('DESCRIPTION', 55, tableTop + 10);
    doc.text('QTÉ', 280, tableTop + 10, { width: 40, align: 'center' });
    doc.text('PRIX UNITAIRE HT', 320, tableTop + 10, { width: 100, align: 'right' });
    doc.text('TVA', 420, tableTop + 10, { width: 40, align: 'center' });
    doc.text('MONTANT HT', 460, tableTop + 10, { width: 85, align: 'right' });

    const rowY = tableTop + 40;
    doc.fillColor('#0f172a').font('Helvetica').fontSize(10);
    doc.text(description, 55, rowY, { width: 220 });
    doc.text('1', 280, rowY, { width: 40, align: 'center' });
    doc.font('Helvetica-Bold').text(`${amountHT.toLocaleString('fr-FR')}`, 320, rowY, { width: 100, align: 'right' });
    doc.font('Helvetica').fontSize(9).text(`${taxRate}%`, 420, rowY, { width: 40, align: 'center' });
    doc.font('Helvetica-Bold').fontSize(10).text(`${amountHT.toLocaleString('fr-FR')}`, 460, rowY, { width: 85, align: 'right' });

    // Border below row
    doc.moveTo(40, rowY + 25).lineTo(555, rowY + 25).strokeColor('#f1f5f9').stroke();

    // --- Summary ---
    const summaryY = rowY + 60;
    const summaryLabelX = 350;
    const summaryValueX = 460;

    doc.fillColor('#64748b').font('Helvetica').fontSize(10).text('Sous-total HT', summaryLabelX, summaryY);
    doc.fillColor('#0f172a').font('Helvetica-Bold').text(`${amountHT.toLocaleString('fr-FR')} Ar`, summaryValueX, summaryY, { align: 'right', width: 85 });

    doc.fillColor('#64748b').font('Helvetica').fontSize(10).text(`TVA (${taxRate}%)`, summaryLabelX, summaryY + 20);
    doc.fillColor('#0f172a').font('Helvetica-Bold').text(`${taxAmount.toLocaleString('fr-FR')} Ar`, summaryValueX, summaryY + 20, { align: 'right', width: 85 });

    doc.rect(summaryLabelX - 10, summaryY + 40, 215, 45).fill('#4f46e5');
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(10).text('TOTAL TTC', summaryLabelX, summaryY + 50);
    doc.fontSize(16).text(`${totalAmount.toLocaleString('fr-FR')} Ar`, summaryValueX - 30, summaryY + 55, { align: 'right', width: 115 });

    // --- Footer ---
    const footerY = 750;
    doc.moveTo(40, footerY).lineTo(555, footerY).strokeColor('#e2e8f0').stroke();
    doc.fillColor('#94a3b8').font('Helvetica').fontSize(8);
    doc.text('Merci de votre confiance. YoTech Compute vous accompagne dans votre transformation digitale.', 40, footerY + 15, { align: 'center', width: 515 });
    doc.text('Facture générée numériquement — YoTech ERP v2.0', 40, footerY + 30, { align: 'center', width: 515 });

    doc.end();
  } catch (error) {
    console.error('Error generating invoice PDF:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

