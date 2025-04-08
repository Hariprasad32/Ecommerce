const Product = require("../../models/productSchema")
const Category = require("../../models/categorySchema")
const User = require("../../models/userSchema")
const fs = require("fs")
const path = require("path")
const sharp = require("sharp")
const mongoose = require('mongoose')

// Helper function to calculate sale price based on offers
const calculateSalePrice = (regularPrice, productOffer = 0, categoryOffer = 0) => {
    // Use the higher of product or category offer
    const bestOffer = Math.max(productOffer, categoryOffer);
   
    
    if (bestOffer > 0) {
        // Calculate discounted price based on offer percentage
        const discountAmount = (regularPrice * bestOffer) / 100;
        const calculatedSalePrice = regularPrice - discountAmount;

       
        return Math.round(calculatedSalePrice * 100) / 100;
    }
    
    // If no offer, return null (no sale price)
    return null;
};

const productInfo = async (req, res) => {
    try {
        const search = req.query.search || "";
        const page = parseInt(req.query.page) || 1;
        const limit = 4;
        const skip = (page - 1) * limit;
        const productData = await Product.find({
            $or: [
                { productName: { $regex: new RegExp(".*" + search + ".*", "i") } },
            ]
        })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .populate("category")
            .exec();

        // Calculate sale prices based on offers
        productData.forEach(product => {
            const categoryOffer = product.category?.categoryOffer || 0;
            const productOffer = product.productOffer || 0;
            
            // Update sale price based on best offer
            product.salePrice = calculateSalePrice(
                product.regularPrice,
                productOffer,
                categoryOffer
            );
        });

        const count = await Product.find({
            $or: [
                { productName: { $regex: new RegExp(".*" + search + ".*", "i") } },
            ]
        }).countDocuments();

        const totalPages = Math.ceil(count / limit);

        const category = await Category.find({ isListed: true });

        if (category) {
            res.render('product', {
                data: productData,
                currentPage: page,
                totalPages: totalPages,
                totalProducts: count,
                category: category,
                page: "products"
            });
        } else {
            res.render("error-page");
        }

    } catch (error) {
        console.error("Error fetching products:", error);
        res.redirect('/error-page');
    }
};

const getProductAddProduct = async (req,res)=>{
    try{
        const category = await Category.find({isListed:true})
        
        res.render("addProduct",{category,page:"addProducts"})
    }catch(error){

        res.redirect('/error-page')
    }
};

const addProducts = async (req, res) => {
    try {
        const products = req.body;


        if (!products.productName || !products.description || !products.regularPrice  || !products.color || !products.category) {
            return res.status(400).json({ error: "All fields are required!" });
        }
        const productExists = await Product.findOne({ productName: products.productName });
        if (productExists) {
            return res.status(400).json({ error: "Product already exists with this name!" });
        }
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ error: "No images uploaded!" });
        }


        const sizeEntries = [];
        const sizeKeys = ['s','m','l','xl','xxl'];


        let hasSizeQuantity = false



        sizeKeys.forEach((size)=>{
            const quantityKey = `quantity-${size}`;
            const quantity = parseInt(products[quantityKey] || 0)

            if(quantity>0){
                hasSizeQuantity = true;
                sizeEntries.push({
                    size:size.toUpperCase(),
                    quantity:quantity
                })
            }


        })
        if(!hasSizeQuantity){
            return res.status(400).json({error:"At least one size quantity is required!"})
        }

        const images = [];
        const uploadDir = path.join(__dirname, "../../public/uploads/productImage");


        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }

   
        for (let file of req.files) {
            const originalImagePath = file.path; 
            const resizedImagePath = path.join(uploadDir, file.filename + "-resized.png");

            await sharp(originalImagePath)
                .resize({ width: 450, height: 450, fit: 'cover' }) 
                .toFormat('png') 
                .toFile(resizedImagePath);

 
            images.push(`uploads/productImage/${file.filename}-resized.png`);

            fs.unlinkSync(originalImagePath);
        }

        const categoryId = await Category.findOne({ name: products.category });
        if (!categoryId) {
            return res.status(400).json({ error: "Category not found!" });
        }

        // Calculate sale price based on product and category offers
        const regularPrice = parseFloat(products.regularPrice);
        const salePrice = parseFloat(products.salePrice)
        const productOffer = 0; // New product, no offer initially
        const categoryOffer = categoryId.categoryOffer || 0;
        
        const calculatedSalePrice = calculateSalePrice(regularPrice, productOffer, categoryOffer);
     
      
        const newProduct = new Product({
            productName: products.productName,
            description: products.description,
            category: categoryId._id,
            regularPrice: regularPrice,
            salePrice: calculatedSalePrice, 
            sizes: sizeEntries,
            color: products.color,
            productImage: images,
            status: "Available",
            createdOn: new Date(),
        });

       

        await newProduct.save();
        res.status(201).json({
            message: "Product added successfully!",
            product: newProduct,
        });

    } catch (error) {
        console.error("Error saving product:", error);
        res.status(500).json({ error: error.message });
    }
};

const getEditProduct = async (req, res) => {
    try {
        const id = req.query.id;
        const product = await Product.findById(id).populate("category");
        const category = await Category.find({});

        if (!product) {
            return res.redirect('/error-page');
        }

        // Calculate sale price based on offers
        const regularPrice = product.regularPrice;
        const productOffer = product.productOffer || 0;
        const categoryOffer = product.category?.categoryOffer || 0;
        
        const calculatedSalePrice = calculateSalePrice(regularPrice, productOffer, categoryOffer);
        
        // Update product sale price with calculated value
        product.salePrice = calculatedSalePrice;
      
        const sizesObject = {};
        if (product.sizes && Array.isArray(product.sizes)) {
            product.sizes.forEach(sizeEntry => {
                sizesObject[sizeEntry.size] = sizeEntry.quantity;
            });
        }

        const allSizes = ['S', 'M', 'L', 'XL', 'XXL'];
        allSizes.forEach(size => {
            if (!(size in sizesObject)) {
                sizesObject[size] = 0;
            }
        });

       
        const productWithSizesObject = {
            ...product.toObject(),
            sizes: sizesObject
        };

        res.render("edit-products", {
            product: productWithSizesObject,
            category,
            page: "editProduct"
        });
    } catch (error) {
        console.error("Error fetching product for edit:", error);
        res.redirect('/error-page');
    }
};

const editProduct = async (req, res) => {
    try {
        const id = req.params.id;
        const product = await Product.findById(id);
        if (!product) {
            return res.status(404).send("Product not found");
        }

        const data = req.body;

        const duplicateProduct = await Product.findOne({
            _id: { $ne: id },
            productName: { $regex: new RegExp(`^${data.productName}$`, 'i') }
        });

        if (duplicateProduct) {
            return res.status(400).json({
                error: "duplicate_name",
                message: "A product with this name already exists"
            });
        }

        let updatedProductImages = [...product.productImage];
        if (data.removedImages) {
            let removedImages = data.removedImages;
            if (typeof removedImages === 'string') {
                removedImages = removedImages.split(',').map(img => img.trim());
            } else if (!Array.isArray(removedImages)) {
                removedImages = [removedImages];
            }

            for (const image of removedImages) {
                if (typeof image !== 'string' || !image) {
                    console.warn("Skipping invalid image path:", image);
                    continue;
                }

                const normalizedPath = image.replace(/^uploads\/productImage\//, '');
                const imagePath = path.join(process.cwd(), "public/uploads/productImage", normalizedPath);

                try {
                    if (fs.existsSync(imagePath)) {
                        fs.unlinkSync(imagePath);
                    } else {
                        console.log("File does not exist:", imagePath);
                    }
                } catch (fileError) {
                    console.error("Error deleting file:", fileError);
                }

                updatedProductImages = updatedProductImages.filter(img => !img.includes(normalizedPath));
            }
        }

        const newImages = req.files && req.files.length > 0
            ? req.files.map(file => `uploads/productImage/${file.filename}-resized.png`)
            : [];
        updatedProductImages = [...updatedProductImages, ...newImages];

        if (data.images && data.images.length > 0) {
            const imagesToProcess = Array.isArray(data.images) ? data.images : [data.images];
            for (let i = 0; i < imagesToProcess.length; i++) {
                const base64Data = imagesToProcess[i];
                if (!base64Data || typeof base64Data !== 'string' || !base64Data.startsWith('data:image/')) continue;

                const filename = `img_${Date.now()}_${i}.png`;
                const filepath = path.join(process.cwd(), "public/uploads/productImage", filename);

                const dir = path.dirname(filepath);
                if (!fs.existsSync(dir)) {
                    fs.mkdirSync(dir, { recursive: true });
                }

                const base64Image = base64Data.split(';base64,').pop();
                const imageBuffer = Buffer.from(base64Image, 'base64');

                try {
                    await sharp(imageBuffer)
                        .resize({ width: 450, height: 450, fit: 'cover' })
                        .toFile(filepath);
                    updatedProductImages.push(`uploads/productImage/${filename}`);
                } catch (sharpError) {
                    console.error("Error processing image with sharp:", sharpError);
                }
            }
        }

        if (updatedProductImages.length < 3) {
            return res.status(400).json({
                error: "insufficient_images",
                message: "Please upload at least 3 product images"
            });
        }

        let categoryId;
        let categoryDoc;
        try {
            if (mongoose.Types.ObjectId.isValid(data.category)) {
                categoryDoc = await Category.findById(data.category);
                if (categoryDoc) {
                    categoryId = categoryDoc._id;
                } else {
                    return res.status(400).json({ error: "Invalid category ID" });
                }
            } else {
                return res.status(400).json({ error: "Category must be a valid ID" });
            }
        } catch (catError) {
            console.error("Error finding category:", catError);
            return res.status(400).json({ error: "Category error: " + catError.message });
        }

      
        const sizeEntries = [];
        const sizeKeys = ['s', 'm', 'l', 'xl', 'xxl'];
        let hasSizeQuantity = false;

        sizeKeys.forEach((size) => {
            const quantityKey = `quantity-${size}`;
            const quantity = parseInt(data[quantityKey] || 0);

            if (quantity > 0) {
                hasSizeQuantity = true;
                sizeEntries.push({
                    size: size.toUpperCase(),
                    quantity: quantity
                });
            }
        });

        if (!hasSizeQuantity) {
            return res.status(400).json({
                error: "insufficient_quantity",
                message: "Please provide at least one size quantity"
            });
        }

        // Calculate sale price based on product and category offers
        const regularPrice = parseFloat(data.regularPrice);
        const productOffer = product.productOffer || 0;
        const categoryOffer = categoryDoc?.categoryOffer || 0;
        
        const calculatedSalePrice = calculateSalePrice(regularPrice, productOffer, categoryOffer);

        const updatedFields = {
            productName: data.productName.trim(),
            description: data.description.trim(),
            category: categoryId,
            regularPrice: regularPrice,
            salePrice: calculatedSalePrice, // Use calculated sale price
            sizes: sizeEntries,  
            color: data.color.trim(),
            productImage: updatedProductImages
        };

        const updatedProduct = await Product.findByIdAndUpdate(id, updatedFields, { new: true });

        res.status(200).json({
            success: true,
            message: "Product updated successfully",
            redirectUrl: "/admin/products"
        });
    } catch (error) {
        console.error("Error saving edited data:", error);
        res.status(500).json({ error: error.message });
    }
};

const deleteSingleImage = async (req, res) => {
    try {
        const {imageNmaeToServer,productIdToServer} = req.body;
        const product = await Product.findByIdAndUpdate(productIdToServer,{$pull:{productImage:imageNameToServer}});
        const imagePath = path.join("public","uploads", "re-image",imageNameToServer);
        if(fs.existsSync(imagePath)){
            await fs.unlinkSync(imagePath);
            // console.log(`Image ${imageNameToServer} deleted successfully`)
        }else{
            console.log(`Image ${imageNameToServer} not found`)
        }
        res.send({status:true});
    } catch (error) {
        res.redirect("/error-page")
    }
};

const blockProduct = async (req, res) => {
    try {
        const id = req.query.id;
        
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ error: "Invalid product ID" });
        }

        await Product.updateOne({ _id: id }, { $set: { isBlocked: true } });

        res.redirect("/admin/products");
    } catch (error) {
        console.error("Error blocking product:", error);
        res.redirect("/error-page");
    }
};

const unblockProduct = async (req, res) => {
    try {
        const id = req.query.id;
        
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ error: "Invalid product ID" });
        }

        await Product.updateOne({ _id: id }, { $set: { isBlocked: false } });

        res.redirect("/admin/products");
    } catch (error) {
        console.error("Error unblocking product:", error);
        res.redirect('/error-page');
    }
};

const addOffer = async (req,res)=>{
    try {
        const { productId, offerPercentage } = req.body;
        
        if (!offerPercentage || offerPercentage < 1 || offerPercentage > 100) {
            return res.status(400).json({ success: false, message: "Invalid offer percentage" });
        }

        // Get the product to calculate new sale price
        const product = await Product.findById(productId).populate("category");
        if (!product) {
            return res.status(404).json({ success: false, message: "Product not found" });
        }
        
        // Get category offer if available
        const categoryOffer = product.category?.categoryOffer || 0;
        
        // Calculate new sale price
        const calculatedSalePrice = calculateSalePrice(
            product.regularPrice,
            offerPercentage,
            categoryOffer
        );
        
        await Product.updateOne(
            { _id: productId },
            { 
                productOffer: offerPercentage,
                salePrice: calculatedSalePrice
            }
        );
        
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

const removeOffer = async(req,res)=>{
    try {
        const {productId} = req.body;
        
        // Get the product to recalculate sale price
        const product = await Product.findById(productId).populate("category");
        if (!product) {
            return res.status(404).json({ success: false, message: "Product not found" });
        }
        
        // Calculate new sale price based on category offer only
        const categoryOffer = product.category?.categoryOffer || 0;
        const calculatedSalePrice = calculateSalePrice(
            product.regularPrice,
            0, // Product offer is being removed
            categoryOffer
        );
        
        await Product.updateOne(
            { _id: productId },
            { 
                productOffer: 0,
                salePrice: calculatedSalePrice
            }
        );
        
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Add a function to update sale prices of all products when a category offer changes
const updateProductSalePrices = async (categoryId) => {
    try {
        // Get all products in the category
        const products = await Product.find({ category: categoryId });
        const category = await Category.findById(categoryId);
        
        if (!category) return;
        
        const categoryOffer = category.categoryOffer || 0;
        
        // Update each product's sale price
        for (const product of products) {
            const productOffer = product.productOffer || 0;
            const calculatedSalePrice = calculateSalePrice(
                product.regularPrice,
                productOffer,
                categoryOffer
            );
            
            await Product.updateOne(
                { _id: product._id },
                { salePrice: calculatedSalePrice }
            );
        }
    } catch (error) {
        console.error("Error updating product sale prices:", error);
    }
};

module.exports = {
    getProductAddProduct,
    productInfo,
    addProducts,
    getEditProduct,
    editProduct,
    deleteSingleImage,
    blockProduct,
    unblockProduct,
    addOffer,
    removeOffer,
    updateProductSalePrices
}