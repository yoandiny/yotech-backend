import { HRModel } from '../models/hrModel.js';

export const TR_IRSA = [
  { limit: 350000, rate: 0 },
  { limit: 400000, rate: 0.05 },
  { limit: 500000, rate: 0.10 },
  { limit: 600000, rate: 0.15 },
  { limit: Infinity, rate: 0.20 }
];

const calculateIRSA = (taxableIncome, childrenCount) => {
  if (taxableIncome <= 350000) return 0;

  let totalTax = 0;
  let previousLimit = 0;

  for (const bracket of TR_IRSA) {
    if (taxableIncome > previousLimit) {
      const taxableInBracket = Math.min(taxableIncome, bracket.limit) - previousLimit;
      if (taxableInBracket > 0) {
        totalTax += taxableInBracket * bracket.rate;
      }
      previousLimit = bracket.limit;
    } else {
      break;
    }
  }

  // Minimum tax of 2,000 Ar if income > 350,000
  if (taxableIncome > 350000 && totalTax < 2000) {
    totalTax = 2000;
  }

  // Deduction for children
  const deduction = childrenCount * 2000;
  return Math.max(0, totalTax - deduction);
};

export const HRController = {
  // Employees
  getEmployees: async (req, res) => {
    try {
      const employees = await HRModel.getEmployees();
      res.json(employees);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  },

  addEmployee: async (req, res) => {
    try {
      const employee = await HRModel.addEmployee(req.body);
      res.status(201).json(employee);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  },

  updateEmployee: async (req, res) => {
    try {
      const employee = await HRModel.updateEmployee(req.params.id, req.body);
      res.json(employee);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  },

  deleteEmployee: async (req, res) => {
    try {
      await HRModel.deleteEmployee(req.params.id);
      res.json({ message: 'Employé supprimé' });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  },

  // Freelancers
  getFreelancers: async (req, res) => {
    try {
      const freelancers = await HRModel.getFreelancers();
      res.json(freelancers);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  },

  addFreelancer: async (req, res) => {
    try {
      const freelancer = await HRModel.addFreelancer(req.body);
      res.status(201).json(freelancer);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  },

  // Transactions (Advances/Primes)
  addTransaction: async (req, res) => {
    try {
      const transaction = await HRModel.addHRTransaction(req.body);
      res.status(201).json(transaction);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  },

  // Payroll Generation
  generatePayroll: async (req, res) => {
    const { employee_id, month, year } = req.body;
    try {
      const employee = await HRModel.getEmployeeById(employee_id);
      if (!employee) return res.status(404).json({ message: 'Employé non trouvé' });

      const transactions = await HRModel.getUnprocessedTransactions(employee_id, month, year);
      
      const primes = transactions.filter(t => t.type === 'PRIME').reduce((sum, t) => sum + Number(t.amount), 0);
      const advances = transactions.filter(t => t.type === 'AVANCE').reduce((sum, t) => sum + Number(t.amount), 0);

      const baseSalary = Number(employee.base_salary);
      const grossSalary = baseSalary + primes;

      let cnapsWorker = 0;
      let cnapsEmployer = 0;
      let ostieWorker = 0;
      let ostieEmployer = 0;

      if (employee.is_social_subject) {
        cnapsWorker = grossSalary * 0.01;
        cnapsEmployer = grossSalary * 0.13;
        ostieWorker = grossSalary * 0.01;
        ostieEmployer = grossSalary * 0.05;
      }

      const taxableIncome = grossSalary - cnapsWorker - ostieWorker;
      const irsa = calculateIRSA(taxableIncome, employee.children_count);

      const netToPay = grossSalary - cnapsWorker - ostieWorker - irsa - advances;
      const totalEmployerCost = grossSalary + cnapsEmployer + ostieEmployer;

      const payrollData = {
        employee_id, month, year,
        base_salary: baseSalary,
        primes_total: primes,
        cnaps_worker: cnapsWorker,
        cnaps_employer: cnapsEmployer,
        ostie_worker: ostieWorker,
        ostie_employer: ostieEmployer,
        irsa,
        advances_deduction: advances,
        net_to_pay: netToPay,
        total_employer_cost: totalEmployerCost
      };

      const payroll = await HRModel.addPayroll(payrollData);
      
      // Mark transactions as processed
      const transactionIds = transactions.map(t => t.id);
      await HRModel.markTransactionsAsProcessed(transactionIds);

      res.status(201).json(payroll);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: error.message });
    }
  },

  getPayrolls: async (req, res) => {
    const { month, year } = req.query;
    try {
      const payrolls = await HRModel.getPayrolls(month, year);
      res.json(payrolls);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  }
};
