import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Fix CORS for Netlify
app.use(cors({
  origin: [
    'https://mannager.netlify.app',
    'https://mmanager.netlify.app',
    'http://localhost:5173'
  ],
  credentials: true
}));

app.use(express.json());

// File-based data storage
const DATA_FILE = path.join(__dirname, 'data.json');

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
    users: [
      {
        id: 1, 
        username: 'ADMIN', 
        password: 'ADMIN123', 
        role: 'admin', 
        name: 'System Admin', 
        language: 'rw'
      }
    ],
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

// Sabbath check - temporarily disabled for testing
const checkSabbath = (req, res, next) => {
  // Temporarily disable Sabbath check
  next();
  
  /*
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
  */
};

// Root route
app.get('/', (req, res) => {
  res.json({ 
    message: 'Shop Manager Backend API',
    status: 'running',
    version: '1.0.0'
  });
});

// Fixed Login Route
app.post('/api/login', (req, res) => {
  console.log('🔐 Login attempt received');
  
  try {
    const { username, password } = req.body;
    
    // Check if request body exists
    if (!req.body) {
      return res.status(400).json({ error: 'No data received' });
    }
    
    // Validate input
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }
    
    console.log('📧 Login attempt for:', username);
    
    // Find user
    const user = data.users.find(u => u.username === username && u.password === password);
    
    if (!user) {
      console.log('❌ Login failed for:', username);
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    console.log('✅ Login successful for:', user.name);
    
    // Create token
    const tokenData = {
      id: user.id, 
      role: user.role,
      name: user.name
    };
    
    const token = Buffer.from(JSON.stringify(tokenData)).toString('base64');
    
    // Send response
    res.json({
      token, 
      user: {
        id: user.id, 
        name: user.name, 
        role: user.role, 
        language: user.language || 'rw'
      }
    });
    
  } catch (error) {
    console.error('💥 Login error:', error);
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
    console.error('Dashboard error:', error);
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

// Users
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

// Clients
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

// Products
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

// Sales
app.post('/api/transactions', auth, checkSabbath, (req, res) => {
  const {clientId, items, paid} = req.body;
  const client = data.clients.find(c => c.id === clientId);
  if (!client) return res.status(404).json({error: 'Client not found'});
  
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

// Loan Payment
app.post('/api/loans/pay', auth, checkSabbath, (req, res) => {
  const { clientId, amount } = req.body;
  const client = data.clients.find(c => c.id === clientId);
  
  if (!client) return res.status(404).json({error: 'Client not found'});
  if (client.loan <= 0) return res.status(400).json({error: 'Client has no loan'});
  if (amount <= 0) return res.status(400).json({error: 'Invalid payment amount'});
  if (amount > client.loan) return res.status(400).json({error: 'Payment exceeds loan amount'});

  const previousLoan = client.loan;
  client.loan -= amount;
  
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
  
  if (client.loan > 0) {
    return res.status(400).json({error: 'Cannot delete client with active loan'});
  }
  
  data.clients.splice(clientIndex, 1);
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

// Delete User
app.delete('/api/users/:id', auth, checkSabbath, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({error: 'Only admin can delete users'});
  }
  
  const userId = parseInt(req.params.id);
  const userIndex = data.users.findIndex(u => u.id === userId);
  
  if (userIndex === -1) return res.status(404).json({error: 'User not found'});
  
  const user = data.users[userIndex];
  
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

// Delete All Notifications
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
  
  if (userId === req.user.id) {
    if (user.password !== currentPassword) {
      return res.status(400).json({error: 'Current password is incorrect'});
    }
  } else {
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

// Update user profile
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

// Admin: Reset user password
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
  
  const clientTransactions = data.transactions
    .filter(t => t.clientId === clientId && t.type === 'sale')
    .sort((a, b) => new Date(b.date) - new Date(a.date));
  
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
  const lowStockThreshold = 5;
  const lowStockProducts = data.products.filter(p => 
    p.stock !== undefined && p.stock <= lowStockThreshold
  );
  
  res.json(lowStockProducts);
});

// Analytics endpoints
app.get('/api/analytics/sales-overview', auth, (req, res) => {
  const { period = 'monthly' } = req.query;
  
  try {
    const salesData = calculateSalesByPeriod(data.transactions, period);
    const topProducts = getTopSellingProducts(data.transactions, data.products);
    const clientStats = getClientStatistics(data.transactions, data.clients);
    
    res.json({
      salesOverview: salesData,
      topProducts,
      clientStats,
      summary: {
        totalRevenue: salesData.reduce((sum, item) => sum + (item.revenue || 0), 0),
        totalTransactions: salesData.reduce((sum, item) => sum + (item.transactions || 0), 0),
        averageSale: calculateAverageSale(data.transactions)
      }
    });
  } catch (error) {
    console.error('Analytics error:', error);
    res.status(500).json({ error: 'Analytics calculation failed' });
  }
});

// Helper Functions
function calculateSalesByPeriod(transactions, period) {
  const sales = {};
  
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
    
    sales[key].revenue += transaction.paid || 0;
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
      productSales[item.productId].revenue += (item.price || 0) * item.quantity;
    });
  });
  
  return Object.values(productSales)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);
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
    
    clientStats[clientId].totalSpent += transaction.paid || 0;
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
  
  const totalRevenue = sales.reduce((sum, t) => sum + (t.paid || 0), 0);
  return totalRevenue / sales.length;
}

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log('✅ Server running on port', PORT);
  console.log('💾 Data file:', DATA_FILE);
  console.log('🔐 Default login: ADMIN / ADMIN123');
});