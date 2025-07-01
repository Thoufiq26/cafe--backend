const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const twilio = require('twilio');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();

app.use(cors());
app.use(express.json());

// Serve static files from uploads directory
const uploadsDir = path.join(__dirname, 'Uploads');
app.use('/Uploads', express.static(uploadsDir));

// Multer setup for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(UploadsDir);
    }
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  },
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png/;
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = filetypes.test(file.mimetype);
    if (extname && mimetype) {
      cb(null, true);
    } else {
      cb(new Error('Images only (jpg, jpeg, png)!'));
    }
  },
});

// MongoDB Atlas Connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb+srv://thoufiqaa11:DMUABdQzHH5QXQu9@cluster0.bcvmx5y.mongodb.net/friendscafe?retryWrites=true&w=majority&appName=Cluster0', {
  serverSelectionTimeoutMS: 30000,
  socketTimeoutMS: 45000,
})
  .then(() => console.log('Connected to MongoDB'))
  .catch((err) => console.error('MongoDB connection error:', err));

// Menu Item Schema
const menuItemSchema = new mongoose.Schema({
  name: String,
  price: Number,
  image: String,
  unit: String,
  available: Boolean,
  category: String,
  description: String,
});

const MenuItem = mongoose.model('MenuItem', menuItemSchema);

// Order Schema
const orderSchema = new mongoose.Schema({
  itemId: String,
  name: String,
  phone: String,
  quantity: Number,
  unit: String,
  collectionTime: String,
  collectionDate: String,
  createdAt: { type: Date, default: Date.now },
  completed: { type: Boolean, default: false },
});

const Order = mongoose.model('Order', orderSchema);

// Admin Schema
const adminSchema = new mongoose.Schema({
  username: String,
  password: String,
});

const Admin = mongoose.model('Admin', adminSchema);

// Rating Schema
const ratingSchema = new mongoose.Schema({
  name: String,
  itemId: String,
  rating: Number,
  comment: String,
  createdAt: { type: Date, default: Date.now },
});

const Rating = mongoose.model('Rating', ratingSchema);

// Shop Status Schema
const shopStatusSchema = new mongoose.Schema({
  isOpen: Boolean,
  acceptingOrders: Boolean,
  message: String,
  updatedAt: { type: Date, default: Date.now },
});

const ShopStatus = mongoose.model('ShopStatus', shopStatusSchema);

// Twilio Setup
console.log('Twilio SID:', process.env.TWILIO_ACCOUNT_SID);
console.log('Twilio Token:', process.env.TWILIO_AUTH_TOKEN);
const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

// API Routes
app.post('/api/admin/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const admin = await Admin.findOne({ username, password });
    if (admin) {
      res.json({ success: true });
    } else {
      res.json({ success: false, message: 'Invalid credentials' });
    }
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

app.get('/api/menu', async (req, res) => {
  try {
    const items = await MenuItem.find();
    console.log('Fetched menu items:', items);
    res.json(items);
  } catch (error) {
    console.error('Menu fetch error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

app.post('/api/menu', upload.single('image'), async (req, res) => {
  try {
    const item = new MenuItem({
      name: req.body.name,
      price: req.body.price,
      image: req.file ? `/Uploads/${req.file.filename}` : '',
      unit: req.body.unit,
      available: req.body.available === 'true',
      category: req.body.category,
      description: req.body.description,
    });
    await item.save();
    console.log('Saved menu item:', item);
    res.json(item);
  } catch (error) {
    console.error('Menu add error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

app.put('/api/menu/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const item = await MenuItem.findByIdAndUpdate(id, req.body, { new: true });
    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }
    res.json(item);
  } catch (error) {
    console.error('Menu update error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

app.delete('/api/menu/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const item = await MenuItem.findByIdAndDelete(id);
    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }
    if (item.image) {
      const imagePath = path.join(__dirname, item.image);
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
    }
    res.json({ message: 'Item deleted' });
  } catch (error) {
    console.error('Menu delete error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});app.post('/api/orders', async (req, res) => {
  try {
    const { items, name, phone, collectionTime, collectionDate } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: 'Items array is required' });
    }

    const orders = [];
    let message = `New Order from ${name} (${phone}) for collection on ${collectionDate} at ${collectionTime}:\n`;

    for (const orderItem of items) {
      if (!orderItem.itemId || !mongoose.Types.ObjectId.isValid(orderItem.itemId)) {
        return res.status(400).json({ message: `Invalid itemId: ${orderItem.itemId}` });
      }
      const item = await MenuItem.findById(orderItem.itemId);
      if (!item) {
        return res.status(404).json({ message: `Item not found: ${orderItem.itemId}` });
      }
      const order = new Order({
        itemId: orderItem.itemId,
        name,
        phone,
        quantity: orderItem.quantity,
        unit: orderItem.unit,
        collectionTime,
        collectionDate,
      });
      orders.push(order);
      message += `${orderItem.quantity} ${orderItem.unit} of ${item.name}\n`;
    }

    await Order.insertMany(orders);

    try {
      await twilioClient.messages.create({
        body: message,
        from: 'whatsapp:+14155238886',
        to: 'whatsapp:+919440733910',
      });
    } catch (twilioError) {
      console.error('Twilio error:', twilioError);
      // Continue despite Twilio failure
    }

    res.json({ message: 'Order placed successfully', orders });
  } catch (error) {
    console.error('Order error:', error);
    res.status(500).json({ message: 'Server error', error: error.message || error });
  }
});

app.get('/api/orders', async (req, res) => {
  try {
    const orders = await Order.find().sort({ createdAt: -1 });
    res.json(orders);
  } catch (error) {
    console.error('Orders fetch error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

app.get('/api/ratings', async (req, res) => {
  try {
    const ratings = await Rating.find();
    res.json(ratings);
  } catch (error) {
    console.error('Ratings fetch error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

app.post('/api/ratings', async (req, res) => {
  try {
    const rating = new Rating(req.body);
    await rating.save();
    res.json(rating);
  } catch (error) {
    console.error('Rating add error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

app.get('/api/shop-status', async (req, res) => {
  try {
    const status = await ShopStatus.findOne().sort({ updatedAt: -1 });
    if (!status) {
      const defaultStatus = {
        isOpen: true,
        acceptingOrders: true,
        message: '',
      };
      const newStatus = new ShopStatus(defaultStatus);
      await newStatus.save();
      return res.json(defaultStatus);
    }
    res.json(status);
  } catch (error) {
    console.error('Shop status error:', error);
    res.status(500).json({ message: 'Error getting shop status', error: error.message });
  }
});

app.put('/api/shop-status', async (req, res) => {
  try {
    const updatedStatus = await ShopStatus.findOneAndUpdate(
      {},
      { ...req.body, updatedAt: new Date() },
      { upsert: true, new: true }
    );
    res.json(updatedStatus);
  } catch (error) {
    console.error('Shop status update error:', error);
    res.status(500).json({ message: 'Error updating shop status', error: error.message });
  }
});

app.put('/api/orders/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const order = await Order.findByIdAndUpdate(id, req.body, { new: true });
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }
    res.json(order);
  } catch (error) {
    console.error('Order update error:', error);
    res.status(500).json({ message: 'Error updating order', error: error.message });
  }
});

// Seed admin and default shop status
const seedAdmin = async () => {
  try {
    const admin = await Admin.findOne({ username: 'aahil' });
    if (!admin) {
      await Admin.create({ username: 'aahil', password: 'aahil1234' });
      console.log('Admin seeded successfully');
    }
    const shopStatus = await ShopStatus.findOne();
    if (!shopStatus) {
      await ShopStatus.create({
        isOpen: true,
        acceptingOrders: true,
        message: '',
      });
      console.log('Shop status seeded successfully');
    }
  } catch (error) {
    console.error('Error seeding admin or shop status:', error);
  }
};
seedAdmin();

app.listen(5000, () => console.log('Server running on port 5000'));