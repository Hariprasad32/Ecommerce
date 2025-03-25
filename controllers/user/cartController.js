const Products = require('../../models/productSchema');
const Categorie = require('../../models/categorySchema');
const User = require('../../models/userSchema');
const Cart = require('../../models/cartSchema')


const getCart = async (req, res) => {
    const userId = req.session.user;
    const userData = await User.findById(userId);
    const cartProducts = await Cart.findOne({ userId: userId }).populate('items.productId');
    // console.log("products in the cart", cartProducts);

    if (userId) {
        // Calculate total price from cart items
        const totalPrice = cartProducts && cartProducts.items && cartProducts.items.length > 0
            ? cartProducts.items.reduce((total, item) => {
                const itemTotal = item.sizes.reduce((sum, size) => sum + (size.quantity * item.price), 0);
                return total + itemTotal;
            }, 0)
            : 0;

        res.render('cart', {
            user: userData,
            cart: cartProducts,
            page: "cartPage",
            totalPrice: totalPrice.toFixed(2), // Pass total price to the template
            calculateSubtotal: function(items) {
                return items.reduce((total, item) => {
                    const itemTotal = item.sizes.reduce((sum, size) => sum + (size.quantity * item.price), 0);
                    return total + itemTotal;
                }, 0);
            }
        });
    }
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

        // Convert quantity to number and validate
        const requestedQuantity = parseInt(quantity);
        if (isNaN(requestedQuantity) || requestedQuantity <= 0) {
            return res.status(400).json({
                success: false,
                message: "Invalid quantity provided"
            });
        }

        // Check if product exists, get price, and verify it's listed and not blocked
        const product = await Products.findById(productId);
        if (!product) {
            return res.status(404).json({
                success: false,
                message: "Product not found"
            });
        }
        // Verify size availability in product stock
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

        // Check if product already exists in cart
        const existingItemIndex = cart.items.findIndex(item => 
            item.productId.toString() === productId
        );

        if (existingItemIndex > -1) {
            // Product exists, check if size exists
            const sizeIndex = cart.items[existingItemIndex].sizes.findIndex(
                s => s.size === size
            );
            
            if (sizeIndex > -1) {
                // Size exists, check total quantity against limit
                const currentQuantity = cart.items[existingItemIndex].sizes[sizeIndex].quantity;
                const newTotalQuantity = currentQuantity + requestedQuantity;

                if (newTotalQuantity > MAX_QUANTITY) {
                    return res.status(400).json({
                        success: false,
                        message: `Quantity limit exceeded. Maximum ${MAX_QUANTITY} items allowed per size.`
                    });
                }

                // Check against product stock
                if (newTotalQuantity > sizeAvailable.quantity) {
                    return res.status(400).json({
                        success: false,
                        message: "Requested quantity exceeds available stock"
                    });
                }

                // Update quantity
                cart.items[existingItemIndex].sizes[sizeIndex].quantity = newTotalQuantity;
            } else {
                // Add new size, check against limit
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
            
            // Update total price
            cart.items[existingItemIndex].totalPrice = 
                cart.items[existingItemIndex].price * 
                cart.items[existingItemIndex].sizes.reduce((sum, s) => sum + s.quantity, 0);
        } else {
            // Add new product to cart, check against limit
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

        // Calculate cart count (total items across all sizes)
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
        // Using populate to get the category data
        const product = await Products.findById(req.params.productId)
            .populate('category', 'isListed') // Populate only the needed fields
            .select('isBlocked'); // Select only the fields we need from the product
        
        if (!product) {
            return res.status(404).json({ isListed: false, isBlocked: true });
        }
        
        // Now we can directly check the category's isListed field
        const isListed = product.category ? product.category.isListed !== false : true;
        const isBlocked = product.isBlocked || false;
        
        console.log("Product status check:", { 
            productId: req.params.productId,
            isListed, 
            isBlocked,
            category: product.category
        });
        
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

        // Find the product in the cart
        const itemIndex = cart.items.findIndex(item => 
            item.productId.toString() === productId
        );

        if (itemIndex === -1) {
            return res.status(404).json({
                success: false,
                message: "Item not found in cart"
            });
        }

        // Find the size in the product
        const sizeIndex = cart.items[itemIndex].sizes.findIndex(
            s => s.size === size
        );

        if (sizeIndex === -1) {
            return res.status(404).json({
                success: false,
                message: "Size not found for this item"
            });
        }

        // Check if the requested quantity is available
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

        // Update quantity
        cart.items[itemIndex].sizes[sizeIndex].quantity = quantity;
        
        // Recalculate total price
        cart.items[itemIndex].totalPrice = 
            cart.items[itemIndex].price * 
            cart.items[itemIndex].sizes.reduce((sum, s) => sum + s.quantity, 0);

        await cart.save();

        // Fetch updated cart with populated products
        const updatedCart = await Cart.findOne({ userId })
            .populate('items.productId')
            .exec();

        res.status(200).json({
            success: true,
            message: "Cart updated successfully",
            cart: updatedCart // Return the updated cart data
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

            // Filter out the specific size
            cart.items[itemIndex].sizes = cart.items[itemIndex].sizes.filter(
                s => s.size !== size
            );

            // If no sizes remain, remove the entire item
            if (cart.items[itemIndex].sizes.length === 0) {
                cart.items.splice(itemIndex, 1);
            } else {
                // Recalculate total price for remaining sizes
                cart.items[itemIndex].totalPrice = 
                    cart.items[itemIndex].price * 
                    cart.items[itemIndex].sizes.reduce((sum, s) => sum + s.quantity, 0);
            }
        } else {
            // Remove entire product if no size specified
            cart.items = cart.items.filter(item => 
                item.productId.toString() !== productId
            );
        }

        // Save and populate the updated cart
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