const Product = require('../../models/productSchema');
const Categorie = require('../../models/categorySchema');
const User = require('../../models/userSchema');






const productDetails = async (req, res) => {
    try {
        const userId = req.session.user ;
        const userData = await User.findById(userId);
        const productId = req.query.id;
        const product = await Product.findById(productId).populate('category');
        // console.log("productDetails:",product)
        const findCategory = product.category;
         
        const categoryOffer = findCategory ?.categoryOffer || 0 ;
        const productOffer = product.productOffer || 0 ;
        const totalOffer = categoryOffer + productOffer;
        const sizeQuantities = {
            S: 0, 
            M: 0,
            L: 0,
            XL: 0,
            XXL: 0
        };


        product.sizes.forEach(sizeObj => {
                 if (sizeQuantities.hasOwnProperty(sizeObj.size)) {
                sizeQuantities[sizeObj.size] = sizeObj.quantity;
                 }
     });        
    
    
     const recommendedProducts = await Product.find({ category: product.category._id, _id: { $ne: product._id } }).limit(4).exec();
    //  console.log(recommendedProducts)
        if(product.isBlocked === false){
            res.render('product-details',{
                user:userData,
                product:product,
                totalOffer:totalOffer,
                category:findCategory,
                size: sizeQuantities,
                recommendedProducts: recommendedProducts,
                
            })
        }else{
            res.redirect('/shop')
        }



       

    } catch (error) {
        console.error("Product details error:", error);
        return res.status(500).send("Server error");
    }
}







module.exports = {
    productDetails
}