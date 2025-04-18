const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin/adminController');
const customerController = require('../controllers/admin/customerController');
const categoryController = require("../controllers/admin/categoryController");
const productController = require("../controllers/admin/productController");
const orderController = require('../controllers/admin/orderController');
const couponController = require('../controllers/admin/couponController');
const analyticsController = require('../controllers/admin/analyticsController')
const walletController =require('../controllers/admin/walletController')
const {
    userAuth,
    adminAuth
} = require('../middlewares/auth');
const uploads = require("../helpers/multer");

router.get('/login', adminController.loadLogin);
router.post('/login', adminController.login);
router.get('/dashboard', adminAuth, adminController.loadDashboard);
router.get('/sales-report', adminAuth, adminController.loadSalesReport);
router.get('/logout', adminController.logout);
router.get('/error-page', adminController.errorPage)



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
router.post('/addOffer', adminAuth, productController.addOffer)
router.post('/removeOffer', adminAuth, productController.removeOffer)
router.post("/addProducts", adminAuth, uploads.array("imageFile", 8), productController.addProducts);
router.get("/editProduct", adminAuth, productController.getEditProduct);
router.post('/editProduct/:id', adminAuth, uploads.array("imageFile", 8), productController.editProduct);
router.post('/deleteImage', adminAuth, productController.deleteSingleImage)
router.get('/blockProduct', adminAuth, productController.blockProduct);
router.get('/unblockProduct', adminAuth, productController.unblockProduct);




//order Management
router.get('/order-list', adminAuth, orderController.getOrders);
router.get('/admin-order-details/:orderId', adminAuth, orderController.getOrderDetails);
router.post('/orders/:orderId/status', orderController.updateOrderStatus);
router.post('/orders/:orderId/:productId/status', orderController.updateProductItemStatus);
router.post('/orders/:orderId/return', orderController.processReturnRequest);



//coupon mangemnet
router.get('/coupon', adminAuth, couponController.getAdminCoupons);
router.get('/coupons/:couponName', adminAuth, couponController.getCouponDetails);
router.post('/editCoupon', adminAuth, couponController.editCoupon);
router.post('/addCoupon', adminAuth, couponController.addCoupon);
router.patch('/deleteCoupon', adminAuth, couponController.deleteCoupon);


//analytics Management

router.get('/analytics/products', analyticsController.getTopProducts);
router.get('/analytics/categories', analyticsController.getTopCategories);
router.get('/analytics/sales-time', analyticsController.getSalesOverTime);

//wallet management


router.get('/wallet-list',adminAuth,walletController.getWallet)
router.get('/transaction-details/:id', adminAuth, walletController.getWalletDetails);



module.exports = router;