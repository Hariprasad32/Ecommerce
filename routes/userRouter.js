    const express = require("express");
    const router = express.Router();
    const passport = require('passport');
    const userController = require("../controllers/user/userController");
    const productController = require("../controllers/user/productController");
    const profileController = require("../controllers/user/profileController");
    const orderController = require('../controllers/user/orderController')
    const cartController = require("../controllers/user/cartController");
    const {userAuth, adminAuth} = require("../middlewares/auth");
    const wishlistController = require("../controllers/user/wishlistController");
    const walletController = require("../controllers/user/walletController");
    const couponController = require("../controllers/user/couponController");



    // login, signup pages
    router.get("/404-page", userController.pageNotFound);
    router.get("/signup", userController.loadSignUp);
    router.post("/signup", userController.signup);
    router.post('/verify-otp', userController.verifyOtp);
    router.post('/resend-otp', userController.resendOtp);
    router.get("/",userAuth,userController.loadHomePage);
    router.get("/login", userController.loadLogin);
    router.post("/login", userController.login);
    router.get('/logout',userController.logout);

    // shop routes 
    router.get("/shop", userController.loadShopPage);
    router.get("/shop/page/:page",userController.loadShopPage);
    router.post("/products",userController.getProducts); 

    // product detail
    router.get('/productDetails', productController.productDetails);







    // profile management
    router.get('/forgotPassword',userAuth,profileController.getForgotPassword);
    router.post('/forgotEmailValid',userAuth, profileController.forgotEmailValid);
    router.post('/verifyForgotPassOtp',userAuth, profileController.verifyForgotPassOtp);
    router.get('/resetPassword',userAuth, profileController.getResetPassword);
    router.post('/forgotResendOtp',userAuth, profileController.resendOtp);
    router.post('/resetPassword',userAuth, profileController.resetPassword);




    //user profile
    router.get('/profile', userAuth, profileController.getProfile);
    router.get('/updateProfile', userAuth, profileController.updateProfile);
    router.post('/edit-profile',userAuth,profileController.editProfile)
    router.post('/send-email-otp',userAuth,profileController.sendEmailOtp);
    router.post('/verify-email-otp',userAuth,profileController.verifyEmailOtp)
    router.get('/myAddress',userAuth,profileController.myAddress);
    router.get('/addAddress', userAuth, profileController.addAddress);
    router.post('/addAddress', userAuth, profileController.addAddress);
    router.get('/getAddress/:id', userAuth, profileController.getAddress);
    router.post('/editAddress', userAuth, profileController.editAddress);
    router.post('/deleteAddress', userAuth, profileController.deleteAddress);
    router.post('/setDefaultAddress', userAuth, profileController.setDefaultAddress);
    router.post('/upload-profile-image', userAuth, profileController.uploadProfileImage);
    router.get('/changePassword',userAuth,profileController.getForgotPassword)



    // cart and wishlist
    
    router.get('/cart',userAuth,cartController.getCart)
    router.post('/add-to-cart', cartController.addToCart);
    router.get('/product-status/:productId',cartController.productStatus)
    router.get('/product-sizes/:id', cartController.getProductSizes);
    router.post('/cart/update',userAuth, cartController.updateCartItem);
    router.post('/cart/remove',userAuth, cartController.removeCartItem);
    router.get('/wishlist',userAuth,wishlistController.getWishlist);
    router.post('/add-to-wishlist',userAuth,wishlistController.addToWishlist);
    router.post('/remove-from-wishlist',userAuth,wishlistController.removeFromWishlist);



    //coupons

    router.get('/get-coupons', couponController.getCoupons);
    router.get('/apply-coupon', couponController.applyCoupon);

    //order routes


    router.get('/orders',userAuth,orderController.getUserOrders)
    router.get('/checkout',userAuth,orderController.getCheckout);
    router.post('/place-order',userAuth,orderController.placeOrder)
    router.get('/order-success',userAuth,orderController.orderSuccess)
    router.get('/order-detail/:id', orderController.getOrderDetails);
    router.post('/cancelOrder',userAuth, orderController.cancelOrder);
    router.post('/returnOrder',userAuth, orderController.submitReturnRequest); 
    router.get('/download-invoice/:orderId',userAuth,orderController.downloadPdf)
    router.post('/create-razorpay-order', orderController.createRazorpayOrder);
    router.post('/verify-razorpay-payment', orderController.verifyRazorpayPayment);
    router.post('/retry-payment', userAuth, orderController.retryPayment);
    router.get('/payment-failure', userAuth, orderController.paymentFailed);
    router.get('/payment-success',userAuth,orderController.paymentSuccess);


//wallet management

    router.get('/wallet',userAuth,walletController.getWallet)
    router.post('/refund-to-wallet',userAuth,walletController.refundToWallet)
    router.get('/check-wallet-balance',userAuth,walletController.checkWalletBalance)












    // google signin
    router.get('/auth/google', passport.authenticate('google', {scope: ['profile', 'email']}));
    router.get('/auth/google/callback',
        passport.authenticate('google', { failureRedirect: '/signup' }),
        (req, res) => {
        
            req.session.user = req.user._id;
            req.session.save((err) => {
                if (err) {
                    console.error('Session save error:', err);
                    return res.redirect('/signup');
                }
                res.redirect('/');
            });
        }
    );






    module.exports = router;