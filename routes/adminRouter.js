const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin/adminController');
const customerController = require('../controllers/admin/customerController');
const categoryController = require("../controllers/admin/categoryController");
const productController = require("../controllers/admin/productController");
const orderController = require('../controllers/admin/orderController')
const { userAuth, adminAuth } = require('../middlewares/auth');
const uploads = require("../helpers/multer");

router.get('/login', adminController.loadLogin);
router.post('/login', adminController.login);
router.get('/dashboard', adminAuth, adminController.loadDashboard);
router.get('/logout', adminController.logout);
router.get
// customer management
router.get('/users', adminAuth, customerController.customerInfo);
router.get('/blockUser', adminAuth, customerController.customerBlocked);
router.get('/unblockUser', adminAuth, customerController.customerUnBlocked);

// category management
router.get('/category', adminAuth, categoryController.categoryInfo);
router.post('/addCategory', adminAuth, categoryController.addCategory);
router.post('/addCategoryOffer', adminAuth, categoryController.addCategoryOffer);
router.post('/removeCategoryOffer', adminAuth, categoryController.removeCategoryOffer);
router.get('/listCategory', adminAuth, categoryController.getListCategory);
router.get('/unlistCategory', adminAuth, categoryController.getUnlistCategory);
router.get('/editCategory', adminAuth, categoryController.getEditCategory);
router.post('/editCategory/:id', adminAuth, categoryController.editCategory);

// product management
router.get("/products", adminAuth, productController.productInfo);
router.get("/addProducts", adminAuth, productController.getProductAddProduct);
router.post("/addProducts", adminAuth, uploads.array("imageFile", 8), productController.addProducts);
router.get("/editProduct", adminAuth, productController.getEditProduct);
router.post('/editProduct/:id',adminAuth,uploads.array("imageFile", 8),productController.editProduct);
router.post('/deleteImage',adminAuth,productController.deleteSingleImage)
router.get('/blockProduct',adminAuth,productController.blockProduct);
router.get('/unblockProduct',adminAuth,productController.unblockProduct);




//order Management

router.get('/order-list',adminAuth,orderController.getOrders)

module.exports = router;