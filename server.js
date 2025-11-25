import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';

const app = express();
app.use(cors({
  origin: [
    'https://mannager.netlify.app',
    'http://localhost:5173',
    'https://mmanager.netlify.app'
  ],
  credentials: true
}));

// File-based data storage
const DATA_FILE = './data.json';

// Load data from file
const loadData = () => {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const fileData = fs.readFileSync(DATA_FILE, 'utf8');
      return JSON.parse(fileData);
    }
  } catch (error) {
    console.error('Error loading data:', error);
  }
  
  // Default data if file doesn't exist
  return {
    users: [{id:1, username:'ADMIN', password:'ADMIN123', role:'admin', name:'System Admin', language:'rw'}],
    clients: [],
    products: [],
    transactions: [],
    notifications: []
  };
};

// Save data to file
const saveData = (data) => {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    console.log('✅ Data saved successfully');
  } catch (error) {
    console.error('Error saving data:', error);
  }
};

let data = loadData();

// Enhanced auth middleware
const auth = (req, res, next) => {
  const authHeader = req.header('Authorization');
  if (!authHeader) return res.status(401).json({error: 'No token'});
  
  try {
    const token = authHeader.replace('Bearer ', '');
    req.user = JSON.parse(Buffer.from(token, 'base64').toString());
    next();
  } catch (err) {
    console.log('Auth error:', err);
    res.status(401).json({error: 'Invalid token'});
  }
};

// Sabbath check
// Enhanced Sabbath check
// Enhanced Sabbath check
const checkSabbath = (req, res, next) => {
  // Temporarily disable Sabbath check for testing
  // return next();
  
  const now = new Date();
  const day = now.getDay();
  const hours = now.getHours();
  const minutes = now.getMinutes();
  
  const currentTimeInMinutes = (hours * 60) + minutes;
  const fridayStart = 18 * 60;
  const saturdayEnd = (18 * 60) + 30;
  
  const isSabbath = 
    (day === 5 && currentTimeInMinutes >= fridayStart) ||
    (day === 6 && currentTimeInMinutes <= saturdayEnd);
  
  if (isSabbath) {
    return res.status(403).json({
      error: 'Sabbath Time - System Unavailable', 
      message: 'The system is unavailable from Friday 18:00 to Saturday 18:30'
    });
  }
  
  next();
};

// Login
// Login route - fix potential issues
app.post('/api/login', checkSabbath, (req, res) => {
  try {
    const { username, password } = req.body;
    
    // Add validation
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }
    
    console.log('Login attempt:', username);
    
    const user = data.users.find(u => u.username === username && u.password === password);
    
    if (!user) {
      console.log('Login failed for user:', username);
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const token = Buffer.from(JSON.stringify({
      id: user.id, 
      role: user.role,
      name: user.name
    })).toString('base64');
    
    console.log('Login successful for:', user.name);
    
    res.json({
      token, 
      user: {
        id: user.id, 
        name: user.name, 
        role: user.role, 
        language: user.language
      }
    });
    
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error during login' });
  }
});

// Dashboard
app.get('/api/dashboard', auth, (req, res) => {
  try {
    const today = new Date().toDateString();
    const dailyIncome = data.transactions
      .filter(t => new Date(t.date).toDateString() === today && t.type !== 'loan_payment')
      .reduce((sum, t) => sum + (t.paid || 0), 0);
    
    const clientsWithLoans = data.clients.filter(c => c.loan > 0);
    const lowStockProducts = data.products.filter(p => 
      p.stock !== undefined && p.stock <= 5
    );
    const notifications = data.notifications.slice(-10).reverse();
    
    res.json({
      dailyIncome: dailyIncome || 0,
      weeklyIncome: dailyIncome * 7,
      monthlyIncome: dailyIncome * 30,
      clientsWithLoans: clientsWithLoans || [],
      lowStockProducts: lowStockProducts || [],
      notifications: notifications || []
    });
  } catch (error) {
    res.json({
      dailyIncome: 0,
      weeklyIncome: 0,
      monthlyIncome: 0,
      clientsWithLoans: [],
      lowStockProducts: [],
      notifications: []
    });
  }
});

// Users - Only admin can create users
app.get('/api/users', auth, (req, res) => {
  res.json(data.users.map(({password, ...user}) => user));
});

app.post('/api/users', auth, checkSabbath, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({error: 'Only admin can create users'});
  }
  
  const user = {
    id: Date.now(),
    ...req.body,
    role: 'standard-user'
  };
  
  data.users.push(user);
  data.notifications.push({
    id: Date.now(),
    message: `User ${user.name} created by ${req.user.name}`,
    type: 'user',
    timestamp: new Date()
  });
  saveData(data);
  
  res.json({id: user.id, name: user.name, username: user.username, role: user.role});
});

// Enhanced Clients with ID and insurer
app.get('/api/clients', auth, (req, res) => {
  res.json(data.clients);
});

app.post('/api/clients', auth, checkSabbath, (req, res) => {
  const client = {
    id: Date.now(),
    loan: 0,
    ...req.body
  };
  
  data.clients.push(client);
  data.notifications.push({
    id: Date.now(),
    message: `Client ${client.name} added`,
    type: 'client',
    timestamp: new Date()
  });
  saveData(data);
  
  res.json(client);
});

// Enhanced Products with package pricing
app.get('/api/products', auth, (req, res) => {
  res.json(data.products);
});

app.post('/api/products', auth, checkSabbath, (req, res) => {
  const product = {
    id: Date.now(),
    ...req.body
  };
  
  data.products.push(product);
  saveData(data);
  res.json(product);
});

// Enhanced Sales with package calculation
app.post('/api/transactions', auth, checkSabbath, (req, res) => {
  const {clientId, items, paid} = req.body;
  const client = data.clients.find(c => c.id === clientId);
  if (!client) return res.status(404).json({error: 'Client not found'});
  
  // Check if client has existing loan
  if (client.loan > 0) {
    const total = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const loan = total - paid;
    
    if (loan > 0) {
      return res.status(400).json({error: 'Client has existing loan - cannot add new loan'});
    }
  }
  
  const total = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const loan = total - paid;
  
  const transaction = {
    id: Date.now(),
    clientId,
    items,
    total,
    paid,
    loan,
    date: new Date(),
    userId: req.user.id,
    type: 'sale'
  };
  
  data.transactions.push(transaction);
  
  if (loan > 0) {
    client.loan += loan;
    data.notifications.push({
      id: Date.now(),
      message: `⚠️ New loan: ${client.name} - ${loan} FRW`,
      type: 'warning',
      timestamp: new Date()
    });
  }
  
  data.notifications.push({
    id: Date.now(),
    message: `💰 Sale: ${client.name} - ${paid} FRW paid`,
    type: 'sale',
    timestamp: new Date()
  });
  
  saveData(data);
  res.json(transaction);
});

// Loan Payment System
app.post('/api/loans/pay', auth, checkSabbath, (req, res) => {
  const { clientId, amount } = req.body;
  const client = data.clients.find(c => c.id === clientId);
  
  if (!client) return res.status(404).json({error: 'Client not found'});
  if (client.loan <= 0) return res.status(400).json({error: 'Client has no loan'});
  if (amount <= 0) return res.status(400).json({error: 'Invalid payment amount'});
  if (amount > client.loan) return res.status(400).json({error: 'Payment exceeds loan amount'});

  // Update client loan
  const previousLoan = client.loan;
  client.loan -= amount;
  
  // Record transaction
  const transaction = {
    id: Date.now(),
    clientId,
    type: 'loan_payment',
    amount,
    previousLoan: previousLoan,
    newLoan: client.loan,
    date: new Date(),
    userId: req.user.id
  };
  
  data.transactions.push(transaction);
  
  // Add notification
  data.notifications.push({
    id: Date.now(),
    message: `✅ Loan payment: ${client.name} paid ${amount} FRW`,
    type: 'success',
    timestamp: new Date()
  });

  saveData(data);
  res.json({
    success: true,
    client: client,
    payment: amount,
    remainingLoan: client.loan
  });
});

// Get client loan history
app.get('/api/clients/:id/loans', auth, (req, res) => {
  const clientId = parseInt(req.params.id);
  const loanTransactions = data.transactions.filter(t => 
    t.clientId === clientId && (t.loan > 0 || t.type === 'loan_payment')
  );
  
  res.json(loanTransactions);
});

// Delete Client
app.delete('/api/clients/:id', auth, checkSabbath, (req, res) => {
  const clientId = parseInt(req.params.id);
  const clientIndex = data.clients.findIndex(c => c.id === clientId);
  
  if (clientIndex === -1) return res.status(404).json({error: 'Client not found'});
  
  const client = data.clients[clientIndex];
  
  // Check if client has active loan
  if (client.loan > 0) {
    return res.status(400).json({error: 'Cannot delete client with active loan'});
  }
  
  data.clients.splice(clientIndex, 1);
  
  // Remove client's transactions
  data.transactions = data.transactions.filter(t => t.clientId !== clientId);
  
  data.notifications.push({
    id: Date.now(),
    message: `Client ${client.name} deleted`,
    type: 'warning',
    timestamp: new Date()
  });
  
  saveData(data);
  res.json({success: true, message: 'Client deleted successfully'});
});

// Update Client
app.put('/api/clients/:id', auth, checkSabbath, (req, res) => {
  const clientId = parseInt(req.params.id);
  const client = data.clients.find(c => c.id === clientId);
  
  if (!client) return res.status(404).json({error: 'Client not found'});
  
  Object.assign(client, req.body);
  
  data.notifications.push({
    id: Date.now(),
    message: `Client ${client.name} updated`,
    type: 'info',
    timestamp: new Date()
  });
  
  saveData(data);
  res.json(client);
});

// Delete Product
app.delete('/api/products/:id', auth, checkSabbath, (req, res) => {
  const productId = parseInt(req.params.id);
  const productIndex = data.products.findIndex(p => p.id === productId);
  
  if (productIndex === -1) return res.status(404).json({error: 'Product not found'});
  
  const product = data.products[productIndex];
  data.products.splice(productIndex, 1);
  
  data.notifications.push({
    id: Date.now(),
    message: `Product ${product.name} deleted`,
    type: 'warning',
    timestamp: new Date()
  });
  
  saveData(data);
  res.json({success: true, message: 'Product deleted successfully'});
});

// Update Product
app.put('/api/products/:id', auth, checkSabbath, (req, res) => {
  const productId = parseInt(req.params.id);
  const product = data.products.find(p => p.id === productId);
  
  if (!product) return res.status(404).json({error: 'Product not found'});
  
  Object.assign(product, req.body);
  
  data.notifications.push({
    id: Date.now(),
    message: `Product ${product.name} updated`,
    type: 'info',
    timestamp: new Date()
  });
  
  saveData(data);
  res.json(product);
});

// Delete User (Admin only)
app.delete('/api/users/:id', auth, checkSabbath, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({error: 'Only admin can delete users'});
  }
  
  const userId = parseInt(req.params.id);
  const userIndex = data.users.findIndex(u => u.id === userId);
  
  if (userIndex === -1) return res.status(404).json({error: 'User not found'});
  
  const user = data.users[userIndex];
  
  // Prevent deleting yourself
  if (userId === req.user.id) {
    return res.status(400).json({error: 'Cannot delete your own account'});
  }
  
  data.users.splice(userIndex, 1);
  
  data.notifications.push({
    id: Date.now(),
    message: `User ${user.name} deleted by ${req.user.name}`,
    type: 'warning',
    timestamp: new Date()
  });
  
  saveData(data);
  res.json({success: true, message: 'User deleted successfully'});
});

// Update User
app.put('/api/users/:id', auth, checkSabbath, (req, res) => {
  const userId = parseInt(req.params.id);
  const user = data.users.find(u => u.id === userId);
  
  if (!user) return res.status(404).json({error: 'User not found'});
  
  // Only admin can change roles
  if (req.body.role && req.user.role !== 'admin') {
    return res.status(403).json({error: 'Only admin can change roles'});
  }
  
  Object.assign(user, req.body);
  
  data.notifications.push({
    id: Date.now(),
    message: `User ${user.name} updated`,
    type: 'info',
    timestamp: new Date()
  });
  
  saveData(data);
  res.json(user);
});

// Delete Notification (Clear recent activities)
app.delete('/api/notifications', auth, (req, res) => {
  data.notifications = [];
  saveData(data);
  res.json({success: true, message: 'All notifications cleared'});
});

// Delete Single Notification
app.delete('/api/notifications/:id', auth, (req, res) => {
  const notificationId = parseInt(req.params.id);
  const notificationIndex = data.notifications.findIndex(n => n.id === notificationId);
  
  if (notificationIndex === -1) return res.status(404).json({error: 'Notification not found'});
  
  data.notifications.splice(notificationIndex, 1);
  saveData(data);
  res.json({success: true, message: 'Notification deleted'});
});

// Language settings
app.put('/api/user/language', auth, (req, res) => {
  const user = data.users.find(u => u.id === req.user.id);
  if (user) {
    user.language = req.body.language;
    saveData(data);
  }
  res.json({language: req.body.language});
});

// Change User Password
app.put('/api/users/:id/password', auth, checkSabbath, (req, res) => {
  const userId = parseInt(req.params.id);
  const user = data.users.find(u => u.id === userId);
  
  if (!user) return res.status(404).json({error: 'User not found'});
  
  const { currentPassword, newPassword } = req.body;
  
  // If changing own password, verify current password
  if (userId === req.user.id) {
    if (user.password !== currentPassword) {
      return res.status(400).json({error: 'Current password is incorrect'});
    }
  } else {
    // If admin changing other user's password, require admin role
    if (req.user.role !== 'admin') {
      return res.status(403).json({error: 'Only admin can change other users passwords'});
    }
  }
  
  if (!newPassword || newPassword.length < 3) {
    return res.status(400).json({error: 'New password must be at least 3 characters'});
  }
  
  user.password = newPassword;
  
  data.notifications.push({
    id: Date.now(),
    message: `Password changed for user ${user.name}`,
    type: 'security',
    timestamp: new Date()
  });
  
  saveData(data);
  res.json({success: true, message: 'Password updated successfully'});
});

// Get current user profile
app.get('/api/user/profile', auth, (req, res) => {
  const user = data.users.find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({error: 'User not found'});
  
  const { password, ...userWithoutPassword } = user;
  res.json(userWithoutPassword);
});

// Update user profile (name, language, etc.)
app.put('/api/user/profile', auth, checkSabbath, (req, res) => {
  const user = data.users.find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({error: 'User not found'});
  
  const { name, language } = req.body;
  
  if (name) user.name = name;
  if (language) user.language = language;
  
  data.notifications.push({
    id: Date.now(),
    message: `Profile updated for ${user.name}`,
    type: 'info',
    timestamp: new Date()
  });
  
  saveData(data);
  
  const { password, ...userWithoutPassword } = user;
  res.json(userWithoutPassword);
});

// Admin: Reset user password (without current password)
app.put('/api/admin/users/:id/reset-password', auth, checkSabbath, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({error: 'Only admin can reset passwords'});
  }
  
  const userId = parseInt(req.params.id);
  const user = data.users.find(u => u.id === userId);
  
  if (!user) return res.status(404).json({error: 'User not found'});
  
  const { newPassword } = req.body;
  
  if (!newPassword || newPassword.length < 3) {
    return res.status(400).json({error: 'New password must be at least 3 characters'});
  }
  
  user.password = newPassword;
  
  data.notifications.push({
    id: Date.now(),
    message: `Password reset by admin for user ${user.name}`,
    type: 'security',
    timestamp: new Date()
  });
  
  saveData(data);
  res.json({success: true, message: 'Password reset successfully'});
});

// Get client purchase history
app.get('/api/clients/:id/purchases', auth, (req, res) => {
  const clientId = parseInt(req.params.id);
  
  // Get all transactions for this client
  const clientTransactions = data.transactions
    .filter(t => t.clientId === clientId && t.type === 'sale')
    .sort((a, b) => new Date(b.date) - new Date(a.date)); // Most recent first
  
  // Format the data for frontend
  const purchaseHistory = clientTransactions.map(transaction => ({
    id: transaction.id,
    date: transaction.date,
    total: transaction.total,
    paid: transaction.paid,
    loan: transaction.loan,
    items: transaction.items.map(item => ({
      productName: item.name,
      quantity: item.quantity,
      unitPrice: item.price,
      totalPrice: item.price * item.quantity,
      type: item.type
    }))
  }));
  
  res.json(purchaseHistory);
});

// Search clients by name or phone
app.get('/api/clients/search/:query', auth, (req, res) => {
  const query = req.params.query.toLowerCase();
  
  const filteredClients = data.clients.filter(client => 
    client.name.toLowerCase().includes(query) ||
    client.phone.includes(query)
  );
  
  res.json(filteredClients);
});

// Manual Stock Management
app.put('/api/products/:id/stock', auth, checkSabbath, (req, res) => {
  const productId = parseInt(req.params.id);
  const product = data.products.find(p => p.id === productId);
  
  if (!product) return res.status(404).json({error: 'Product not found'});
  
  const { stock } = req.body;
  
  if (stock < 0) {
    return res.status(400).json({error: 'Stock cannot be negative'});
  }
  
  // Initialize stock if not exists
  if (product.stock === undefined) {
    product.stock = 0;
  }
  
  const oldStock = product.stock;
  product.stock = parseInt(stock);
  
  data.notifications.push({
    id: Date.now(),
    message: `📦 Stock updated: ${product.name} - ${oldStock} → ${product.stock}`,
    type: 'stock',
    timestamp: new Date()
  });
  
  saveData(data);
  res.json({
    success: true,
    product: product,
    oldStock: oldStock,
    newStock: product.stock
  });
});

// Get low stock products
app.get('/api/products/low-stock', auth, (req, res) => {
  const lowStockThreshold = 5; // Alert when stock <= 5
  const lowStockProducts = data.products.filter(p => 
    p.stock !== undefined && p.stock <= lowStockThreshold
  );
  
  res.json(lowStockProducts);
});

// Advanced Analytics Endpoints
app.get('/api/analytics/sales-overview', auth, (req, res) => {
  const { period = 'monthly' } = req.query; // daily, weekly, monthly, yearly
  
  const salesData = calculateSalesByPeriod(data.transactions, period);
  const topProducts = getTopSellingProducts(data.transactions, data.products);
  const clientStats = getClientStatistics(data.transactions, data.clients);
  
  res.json({
    salesOverview: salesData,
    topProducts,
    clientStats,
    summary: {
      totalRevenue: salesData.reduce((sum, item) => sum + item.revenue, 0),
      totalTransactions: salesData.reduce((sum, item) => sum + item.transactions, 0),
      averageSale: calculateAverageSale(data.transactions)
    }
  });
});

app.get('/api/analytics/financial-reports', auth, (req, res) => {
  const { startDate, endDate } = req.query;
  
  const report = generateFinancialReport(data.transactions, startDate, endDate);
  res.json(report);
});

app.get('/api/analytics/export-report', auth, (req, res) => {
  const { type, format = 'json' } = req.query; // type: sales, inventory, financial
  
  const report = generateExportReport(data, type);
  
  if (format === 'csv') {
    const csv = convertToCSV(report);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=${type}-report-${Date.now()}.csv`);
    return res.send(csv);
  }
  
  res.json(report);
});

// Helper Functions
function calculateSalesByPeriod(transactions, period) {
  const sales = {};
  const now = new Date();
  
  transactions.filter(t => t.type === 'sale').forEach(transaction => {
    const date = new Date(transaction.date);
    let key;
    
    switch (period) {
      case 'daily':
        key = date.toDateString();
        break;
      case 'weekly':
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - date.getDay());
        key = `Week ${weekStart.toDateString()}`;
        break;
      case 'monthly':
        key = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
        break;
      case 'yearly':
        key = date.getFullYear().toString();
        break;
    }
    
    if (!sales[key]) {
      sales[key] = { revenue: 0, transactions: 0, date: key };
    }
    
    sales[key].revenue += transaction.paid;
    sales[key].transactions += 1;
  });
  
  return Object.values(sales).sort((a, b) => new Date(a.date) - new Date(b.date));
}

function getTopSellingProducts(transactions, products) {
  const productSales = {};
  
  transactions.filter(t => t.type === 'sale').forEach(transaction => {
    transaction.items.forEach(item => {
      if (!productSales[item.productId]) {
        productSales[item.productId] = {
          productId: item.productId,
          productName: item.name,
          quantity: 0,
          revenue: 0
        };
      }
      
      productSales[item.productId].quantity += item.quantity;
      productSales[item.productId].revenue += item.price * item.quantity;
    });
  });
  
  return Object.values(productSales)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10); // Top 10
}

function getClientStatistics(transactions, clients) {
  const clientStats = {};
  
  transactions.filter(t => t.type === 'sale').forEach(transaction => {
    const clientId = transaction.clientId;
    
    if (!clientStats[clientId]) {
      const client = clients.find(c => c.id === clientId);
      clientStats[clientId] = {
        clientId,
        clientName: client?.name || 'Unknown',
        totalSpent: 0,
        transactions: 0,
        lastPurchase: transaction.date
      };
    }
    
    clientStats[clientId].totalSpent += transaction.paid;
    clientStats[clientId].transactions += 1;
    
    if (new Date(transaction.date) > new Date(clientStats[clientId].lastPurchase)) {
      clientStats[clientId].lastPurchase = transaction.date;
    }
  });
  
  return Object.values(clientStats).sort((a, b) => b.totalSpent - a.totalSpent);
}

function calculateAverageSale(transactions) {
  const sales = transactions.filter(t => t.type === 'sale');
  if (sales.length === 0) return 0;
  
  const totalRevenue = sales.reduce((sum, t) => sum + t.paid, 0);
  return totalRevenue / sales.length;
}

function generateFinancialReport(transactions, startDate, endDate) {
  const filteredTransactions = transactions.filter(t => {
    const transactionDate = new Date(t.date);
    const start = startDate ? new Date(startDate) : new Date(0);
    const end = endDate ? new Date(endDate) : new Date();
    return transactionDate >= start && transactionDate <= end;
  });
  
  const sales = filteredTransactions.filter(t => t.type === 'sale');
  const loanPayments = filteredTransactions.filter(t => t.type === 'loan_payment');
  
  return {
    period: { startDate, endDate },
    revenue: {
      totalSales: sales.reduce((sum, t) => sum + t.paid, 0),
      totalLoanPayments: loanPayments.reduce((sum, t) => sum + t.amount, 0),
      grossRevenue: sales.reduce((sum, t) => sum + t.paid, 0) + loanPayments.reduce((sum, t) => sum + t.amount, 0)
    },
    transactions: {
      totalSales: sales.length,
      totalLoanPayments: loanPayments.length,
      averageSaleValue: sales.length > 0 ? sales.reduce((sum, t) => sum + t.paid, 0) / sales.length : 0
    },
    loans: {
      activeLoans: data.clients.filter(c => c.loan > 0).length,
      totalOutstanding: data.clients.reduce((sum, c) => sum + c.loan, 0)
    }
  };
}

app.listen(3000, () => {
  console.log('✅ Server running on http://localhost:3000');
  console.log('💾 Data will be saved in: ' + path.resolve(DATA_FILE));
});