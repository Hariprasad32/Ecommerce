const Products = require('../../models/productSchema');
const Categorie = require('../../models/categorySchema');
const User = require('../../models/userSchema');
const Cart = require('../../models/cartSchema')
const Wishlist = require('../../models/wishlistSchema')

const getCart = async (req, res) => {
    const userId = req.session.user;
    const userData = await User.findById(userId);
    const cartProducts = await Cart.findOne({ userId: userId }).populate('items.productId');

    if (!userId) {
        return res.status(401).json({ message: "User not logged in" });
    }

    if (!cartProducts || !cartProducts.items.length) {
        return res.render('cart', {
            user: userData,
            cart: null,
            page: "cartPage",
            totalPrice: "0.00",
            shippingFee: "0.00",
            calculateSubtotal: () => 0
        });
    }

    const cartItems = cartProducts.items.map(item => {
        const product = item.productId;

        const isBlocked = product && product.isBlocked === true;
        const isUnlisted = product && (product.status === "Out Of Stock" || product.status === "Discontinued");

        const updatedSizes = item.sizes.map(sizeItem => {
            const productSize = product && product.sizes ? product.sizes.find(ps => ps.size === sizeItem.size) : null;
            const isSizeOutOfStock = !productSize || productSize.quantity === 0 || sizeItem.quantity > productSize.quantity;

            return {
                ...sizeItem.toObject(),
                isOutOfStock: isSizeOutOfStock || isBlocked || isUnlisted,
                availableQuantity: productSize ? productSize.quantity : 0
            };
        });

        const isItemOutOfStock = updatedSizes.every(size => size.isOutOfStock) || isBlocked || isUnlisted;

        return {
            ...item.toObject(),
            sizes: updatedSizes,
            isOutOfStock: isItemOutOfStock,
            isBlocked: isBlocked,
            isUnlisted: isUnlisted
        };
    });

    const subtotal = cartItems.reduce((total, item) => {
        if (!item.isOutOfStock) {
            const itemTotal = item.sizes
                .filter(size => !size.isOutOfStock)
                .reduce((sum, size) => sum + (size.quantity * item.price), 0);
            return total + itemTotal;
        }
        return total;
    }, 0);


    const shippingFee = 40.00;

   
    const totalPrice = subtotal + shippingFee;

    res.render('cart', {
        user: userData,
        cart: { ...cartProducts.toObject(), items: cartItems },
        page: "cartPage",
        totalPrice: totalPrice.toFixed(2),
        shippingFee: shippingFee.toFixed(2),
        calculateSubtotal: function (items) {
            return items.reduce((total, item) => {
                if (!item.isOutOfStock) {
                    const itemTotal = item.sizes
                        .filter(size => !size.isOutOfStock)
                        .reduce((sum, size) => sum + (size.quantity * item.price), 0);
                    return total + itemTotal;
                }
                return total;
            }, 0);
        }
    });
};

const addToCart = async (req, res) => {
    try {
        const { productId, size, quantity } = req.body;
        const userId = req.session.user;
        const MAX_QUANTITY = 10; 

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: "Please login to add items to cart",
                redirect: "/login"
            });
        }

        if (!productId || !size || !quantity) {
            return res.status(400).json({
                success: false,
                message: "Product ID, size, and quantity are required"
            });
        }

      
        const requestedQuantity = parseInt(quantity);
        if (isNaN(requestedQuantity) || requestedQuantity <= 0) {
            return res.status(400).json({
                success: false,
                message: "Invalid quantity provided"
            });
        }

     
        const product = await Products.findById(productId);
        if (!product) {
            return res.status(404).json({
                success: false,
                message: "Product not found"
            });
        }
     
        const sizeAvailable = product.sizes.find(s => 
            s.size === size && s.quantity >= requestedQuantity
        );
        if (!sizeAvailable) {
            return res.status(400).json({
                success: false,
                message: "Selected size or quantity not available in stock"
            });
        }

        let cart = await Cart.findOne({ userId });

        if (!cart) {
            cart = new Cart({
                userId,
                items: []
            });
        }

   
        const existingItemIndex = cart.items.findIndex(item => 
            item.productId.toString() === productId
        );

        if (existingItemIndex > -1) {
      
            const sizeIndex = cart.items[existingItemIndex].sizes.findIndex(
                s => s.size === size
            );
            
            if (sizeIndex > -1) {
              
                const currentQuantity = cart.items[existingItemIndex].sizes[sizeIndex].quantity;
                const newTotalQuantity = currentQuantity + requestedQuantity;

                if (newTotalQuantity > MAX_QUANTITY) {
                    return res.status(400).json({
                        success: false,
                        message: `Quantity limit exceeded. Maximum ${MAX_QUANTITY} items allowed per size.`
                    });
                }

            
                if (newTotalQuantity > sizeAvailable.quantity) {
                    return res.status(400).json({
                        success: false,
                        message: "Requested quantity exceeds available stock"
                    });
                }

               
                cart.items[existingItemIndex].sizes[sizeIndex].quantity = newTotalQuantity;
            } else {
              
                if (requestedQuantity > MAX_QUANTITY) {
                    return res.status(400).json({
                        success: false,
                        message: `Quantity limit exceeded. Maximum ${MAX_QUANTITY} items allowed per size.`
                    });
                }

                cart.items[existingItemIndex].sizes.push({
                    size,
                    quantity: requestedQuantity
                });
            }
            
          
            cart.items[existingItemIndex].totalPrice = 
                cart.items[existingItemIndex].price * 
                cart.items[existingItemIndex].sizes.reduce((sum, s) => sum + s.quantity, 0);
        } else {
     
            if (requestedQuantity > MAX_QUANTITY) {
                return res.status(400).json({
                    success: false,
                    message: `Quantity limit exceeded. Maximum ${MAX_QUANTITY} items allowed per size.`
                });
            }

            const price = product.salePrice;
            const totalPrice = price * requestedQuantity;
            
            cart.items.push({
                productId,
                sizes: [{
                    size,
                    quantity: requestedQuantity
                }],
                price,
                totalPrice,
                status: "Placed",
                cancelationReason: "none"
            });
        }

        await cart.save();

        await Wishlist.updateOne(
            { userId },
            { $pull: { products: { productId } } }
          );

     
        const cartCount = cart.items.reduce((total, item) => 
            total + item.sizes.reduce((sum, s) => sum + s.quantity, 0), 0);

        res.status(200).json({
            success: true,
            message: "Product added to cart successfully",
            cartCount
        });

    } catch (error) {
        console.error("Error adding to cart:", error);
        res.status(500).json({
            success: false,
            message: "Failed to add product to cart",
            error: error.message
        });
    }
};

const productStatus = async (req, res) => {
    try {
       
        const product = await Products.findById(req.params.productId)
            .populate('category', 'isListed') 
            .select('isBlocked'); 
        
        if (!product) {
            return res.status(404).json({ isListed: false, isBlocked: true });
        }
        
        
        const isListed = product.category ? product.category.isListed !== false : true;
        const isBlocked = product.isBlocked || false;
        
        // console.log("Product status check:", { 
        //     productId: req.params.productId,
        //     isListed, 
        //     isBlocked,
        //     category: product.category
        // });
        
        res.json({ isListed: isListed, isBlocked: isBlocked });
        
    } catch (error) {
        console.error('Error checking product status:', error);
        res.status(500).json({ isListed: false, isBlocked: true });
    }
}

const getProductSizes = async (req, res) => {
    try {
        const productId = req.params.id;
        const product = await Products.findById(productId);
        
        if (!product) {
            return res.status(404).json({
                success: false,
                message: "Product not found"
            });
        }
        
        res.json({
            success: true,
            sizes: product.sizes.map(size => ({
                size: size.size,
                quantity: size.quantity
            }))
        });
    } catch (error) {
        console.error("Error fetching product sizes:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch sizes"
        });
    }
};

const updateCartItem = async (req, res) => {
    try {
        const { productId, size, quantity } = req.body;
        const userId = req.session.user;

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: "Please login to update cart"
            });
        }

        let cart = await Cart.findOne({ userId });
        if (!cart) {
            return res.status(404).json({
                success: false,
                message: "Cart not found"
            });
        }

        
        const itemIndex = cart.items.findIndex(item => 
            item.productId.toString() === productId
        );

        if (itemIndex === -1) {
            return res.status(404).json({
                success: false,
                message: "Item not found in cart"
            });
        }

        
        const sizeIndex = cart.items[itemIndex].sizes.findIndex(
            s => s.size === size
        );

        if (sizeIndex === -1) {
            return res.status(404).json({
                success: false,
                message: "Size not found for this item"
            });
        }

       
        const product = await Products.findById(productId);
        const sizeAvailable = product.sizes.find(s => 
            s.size === size && s.quantity >= quantity
        );

        if (!sizeAvailable) {
            return res.status(400).json({
                success: false,
                message: "Requested quantity not available"
            });
        }

       
        cart.items[itemIndex].sizes[sizeIndex].quantity = quantity;
        
       
        cart.items[itemIndex].totalPrice = 
            cart.items[itemIndex].price * 
            cart.items[itemIndex].sizes.reduce((sum, s) => sum + s.quantity, 0);

        await cart.save();

       
        const updatedCart = await Cart.findOne({ userId })
            .populate('items.productId')
            .exec();

        res.status(200).json({
            success: true,
            message: "Cart updated successfully",
            cart: updatedCart 
        });

    } catch (error) {
        console.error("Error updating cart:", error);
        res.status(500).json({
            success: false,
            message: "Failed to update cart"
        });
    }
};

const removeCartItem = async (req, res) => {
    try {
        const { productId, size } = req.body;
        const userId = req.session.user;

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: "Please login to remove items"
            });
        }

        let cart = await Cart.findOne({ userId }).populate('items.productId');
        if (!cart) {
            return res.status(404).json({
                success: false,
                message: "Cart not found"
            });
        }

        if (size) {
            const itemIndex = cart.items.findIndex(item => 
                item.productId._id.toString() === productId
            );

            if (itemIndex === -1) {
                return res.status(404).json({
                    success: false,
                    message: "Item not found in cart"
                });
            }

           
            cart.items[itemIndex].sizes = cart.items[itemIndex].sizes.filter(
                s => s.size !== size
            );

           
            if (cart.items[itemIndex].sizes.length === 0) {
                cart.items.splice(itemIndex, 1);
            } else {
                
                cart.items[itemIndex].totalPrice = 
                    cart.items[itemIndex].price * 
                    cart.items[itemIndex].sizes.reduce((sum, s) => sum + s.quantity, 0);
            }
        } else {
            
            cart.items = cart.items.filter(item => 
                item.productId.toString() !== productId
            );
        }

       
        await cart.save();
        const updatedCart = await Cart.findOne({ userId }).populate('items.productId');

        res.status(200).json({
            success: true,
            message: "Item removed from cart",
            cart: updatedCart
        });

    } catch (error) {
        console.error("Error removing from cart:", error);
        res.status(500).json({
            success: false,
            message: "Failed to remove item"
        });
    }
};

module.exports = {
    getCart,
    addToCart,
    getProductSizes,
    updateCartItem ,
    removeCartItem ,
    productStatus

}