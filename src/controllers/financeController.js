import { FinanceModel } from '../models/financeModel.js';

export const getStats = async (req, res) => {
  try {
    const stats = await FinanceModel.getStats();
    const recentTransactions = await FinanceModel.getRecentTransactions();
    res.json({
      stats: {
        totalIncome: parseFloat(stats.total_income || 0),
        totalExpenses: parseFloat(stats.total_expenses || 0),
        netProfit: parseFloat(stats.net_profit || 0)
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
