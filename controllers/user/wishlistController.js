const User = require('../../models/userSchema');
const Product = require('../../models/productSchema');
const Wishlist = require('../../models/wishlistSchema');
const Cart = require('../../models/cartSchema')



const getWishlist = async (req, res) => {
    try {
      const userId = req.session.user;
      const user = await User.findById(userId);
  
      if (!user) {

        return res.redirect('/404-page');
      }
  
      
      const wishlistDoc = await Wishlist.findOne({ userId }).populate({
        path: 'products.productId',
        populate: { path: 'category' }
    });

    const cartDoc = await Cart.findOne({ userId });

    const cartProductIds = cartDoc
      ? cartDoc.items.map((item) => item.productId.toString())
      : [];

    const products = wishlistDoc && wishlistDoc.products.length > 0
    ? wishlistDoc.products
        .filter((item) => !cartProductIds.includes(item.productId.toString()))
        .map((item) => item.productId)
    : [];

      
    res.render('wishlist', { user, wishlist: products });
    } catch (error) {
      console.log("Error loading wishlist:", error);
      res.redirect('/404-page');
    }
};

const addToWishlist = async (req, res) => {
    try {
        const userId = req.session.user;
        const {productId}= req.body

        if(!userId){
            return res.status(401).json({success:false,message:'please login'})
        }
       
        const cart = await Cart.findOne({ userId });
        const isInCart = cart && cart.items.some(
         (item) => item.productId.toString() === productId
        );

         if (isInCart) {
            return res.status(400).json({
            success: false,
            message: 'Product is already in your cart and cannot be added to wishlist',
      });
    }
        let wishlist = await Wishlist.findOne({userId});

        if(!wishlist){
            wishlist = new Wishlist({userId,products:[]})
        }

        if(!wishlist.products.some(item => item.productId.toString() === productId)){
            wishlist.products.push({productId});
            await wishlist.save();
        }
        res.status(200).json({success:true,message:'Product added to wishlist successfully'})
        
    } catch (error) {

        console.log("error adding product to wishlist",error);
        res.status(500).json({success:false,messsage:'internal server error'})
        
    }
}

const removeFromWishlist = async (req,res)=>{
    try {
    
        const userId = req.session.user;
        const {productId} = req.body;
        if (!userId) {
            return res.status(401).json({ success: false, redirect: '/login', message: 'Please sign in to remove from wishlist' });
        }

        const result = await Wishlist.updateOne(
            { userId },
            { $pull: { products: { productId } } }
        );

        if (result.modifiedCount > 0) {
            res.json({ success: true, message: 'Product removed from wishlist' });
        } else {
            res.json({ success: false, message: 'Product not found in wishlist' });
        }
    } catch (error) {
        console.error('Error removing from wishlist:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

module.exports = {
    getWishlist,
    addToWishlist,
    removeFromWishlist,

}