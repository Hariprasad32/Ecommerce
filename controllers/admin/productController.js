const Product = require("../../models/productSchema")
const Category = require("../../models/categorySchema")
const User = require("../../models/userSchema")
const fs = require("fs")
const path = require("path")
const sharp = require("sharp")
const mongoose = require('mongoose')


const calculateSalePrice = (regularPrice, productOffer = 0, categoryOffer = 0) => {

    const bestOffer = Math.max(productOffer, categoryOffer);


    if (bestOffer > 0) {

        const discountAmount = (regularPrice * bestOffer) / 100;
        const calculatedSalePrice = regularPrice - discountAmount;


        return Math.round(calculatedSalePrice * 100) / 100;
    }


    return regularPrice;
};

const productInfo = async (req, res) => {
    try {
        const search = req.query.search || "";
        const page = parseInt(req.query.page) || 1;
        const limit = 4;
        const skip = (page - 1) * limit;
        const productData = await Product.find({
                $or: [{
                    productName: {
                        $regex: new RegExp(".*" + search + ".*", "i")
                    }
                }, ]
            })
            .sort({
                createdAt: -1
            })
            .skip(skip)
            .limit(limit)
            .populate("category")
            .exec();




        const count = await Product.find({
            $or: [{
                productName: {
                    $regex: new RegExp(".*" + search + ".*", "i")
                }
            }, ]
        }).countDocuments();

        const totalPages = Math.ceil(count / limit);

        const category = await Category.find({
            isListed: true
        });

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

const getProductAddProduct = async (req, res) => {
    try {
        const category = await Category.find({
            isListed: true
        })

        res.render("addProduct", {
            category,
            page: "addProducts"
        })
    } catch (error) {

        res.redirect('/error-page')
    }
};


const addProducts = async (req, res) => {
    try {
        const products = req.body;

        if (!products.productName || !products.description || !products.regularPrice || !products.color || !products.category) {
            return res.status(400).json({
                error: "All fields are required!"
            });
        }
        
        const productExists = await Product.findOne({
            productName: products.productName
        });
        if (productExists) {
            return res.status(400).json({
                error: "Product already exists with this name!"
            });
        }
        
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({
                error: "No images uploaded!"
            });
        }

        // Image validation - Check file types
        const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/jpg'];
        for (let file of req.files) {
            if (!allowedMimeTypes.includes(file.mimetype)) {
                return res.status(400).json({
                    error: `Invalid file type: ${file.originalname}. Only image files (JPEG, PNG, GIF, JPG, WebP) are allowed.`
                });
            }
        }

        const sizeEntries = [];
        const sizeKeys = ['s', 'm', 'l', 'xl', 'xxl'];

        let hasSizeQuantity = false

        sizeKeys.forEach((size) => {
            const quantityKey = `quantity-${size}`;
            const quantity = parseInt(products[quantityKey] || 0)

            if (quantity > 0) {
                hasSizeQuantity = true;
                sizeEntries.push({
                    size: size.toUpperCase(),
                    quantity: quantity
                })
            }
        })
        if (!hasSizeQuantity) {
            return res.status(400).json({
                error: "At least one size quantity is required!"
            })
        }

        const images = [];
        const uploadDir = path.join(__dirname, "../../public/uploads/productImage");

        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, {
                recursive: true
            });
        }

        for (let file of req.files) {
            const originalImagePath = file.path;
            const resizedImagePath = path.join(uploadDir, file.filename + "-resized.png");

            try {
                await sharp(originalImagePath)
                    .resize({
                        width: 450,
                        height: 450,
                        fit: 'cover'
                    })
                    .toFormat('png')
                    .toFile(resizedImagePath);

                images.push(`uploads/productImage/${file.filename}-resized.png`);
                fs.unlinkSync(originalImagePath);
            } catch (err) {
               
                fs.unlinkSync(originalImagePath); 
                return res.status(400).json({
                    error: `Invalid image file: ${file.originalname}. Please upload valid image files.`
                });
            }
        }

        const categoryId = await Category.findOne({
            name: products.category
        });
        if (!categoryId) {
            return res.status(400).json({
                error: "Category not found!"
            });
        }

        const regularPrice = parseFloat(products.regularPrice);
        const salePrice = parseFloat(products.salePrice)
        const productOffer = 0; 
        const categoryOffer = categoryId.categoryOffer || 0;

        const calculatedSalePrice = calculateSalePrice(regularPrice, productOffer, categoryOffer);

        const finalSalePrice = Math.min(calculatedSalePrice, salePrice);

        const newProduct = new Product({
            productName: products.productName,
            description: products.description,
            category: categoryId._id,
            regularPrice: regularPrice,
            salePrice: finalSalePrice,
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
        res.status(500).json({
            error: error.message
        });
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

        const regularPrice = product.regularPrice;
        const productOffer = product.productOffer || 0;
        const categoryOffer = product.category ?.categoryOffer || 0;
        const salePrice = product.salePrice

        const calculatedSalePrice = calculateSalePrice(regularPrice, productOffer, categoryOffer);

        const finalSalePrice = Math.min(calculatedSalePrice, salePrice);


        product.salePrice = finalSalePrice;

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

        // Validate uploaded files first
        if (req.files && req.files.length > 0) {
            for (const file of req.files) {
                // Check if it's an image file
                if (!file.mimetype.startsWith('image/')) {
                    return res.status(400).json({
                        error: "invalid_file_type",
                        message: "Only image files are allowed"
                    });
                }
                
                // Check file size (max 5MB)
                const maxSize = 5 * 1024 * 1024; // 5MB
                if (file.size > maxSize) {
                    return res.status(400).json({
                        error: "file_too_large",
                        message: `File ${file.originalname} is too large. Maximum size is 5MB.`
                    });
                }
            }
        }

        const duplicateProduct = await Product.findOne({
            _id: {
                $ne: id
            },
            productName: {
                $regex: new RegExp(`^${data.productName}$`, 'i')
            }
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

        const newImages = req.files && req.files.length > 0 ?
            req.files.map(file => `uploads/productImage/${file.filename}-resized.png`) :
            [];
        updatedProductImages = [...updatedProductImages, ...newImages];

        if (data.images && data.images.length > 0) {
            const imagesToProcess = Array.isArray(data.images) ? data.images : [data.images];
            for (let i = 0; i < imagesToProcess.length; i++) {
                const base64Data = imagesToProcess[i];
                if (!base64Data || typeof base64Data !== 'string' || !base64Data.startsWith('data:image/')) {
                    console.warn("Skipping invalid base64 data:", base64Data?.substring(0, 30));
                    continue;
                }

                // Validate that it's an image type
                const mimeType = base64Data.match(/data:(.*?);/)?.[1];
                if (!mimeType.startsWith('image/')) {
                    return res.status(400).json({
                        error: "invalid_image_type",
                        message: "Only image files are allowed"
                    });
                }

                // Validate base64 image size (roughly)
                const base64Content = base64Data.split(';base64,').pop();
                const sizeInBytes = Math.ceil((base64Content.length * 3) / 4);
                if (sizeInBytes > 5 * 1024 * 1024) { // 5MB
                    return res.status(400).json({
                        error: "image_too_large",
                        message: "Image size should not exceed 5MB"
                    });
                }

                const filename = `img_${Date.now()}_${i}.png`;
                const filepath = path.join(process.cwd(), "public/uploads/productImage", filename);

                const dir = path.dirname(filepath);
                if (!fs.existsSync(dir)) {
                    fs.mkdirSync(dir, {
                        recursive: true
                    });
                }

                const base64Image = base64Content;
                const imageBuffer = Buffer.from(base64Image, 'base64');

                try {
                    // Check image dimensions
                    const imageInfo = await sharp(imageBuffer).metadata();
                    if (imageInfo.width < 300 || imageInfo.height < 300) {
                        return res.status(400).json({
                            error: "invalid_image_dimensions",
                            message: "Image dimensions should be at least 300x300 pixels"
                        });
                    }

                   
                    await sharp(imageBuffer)
                        .resize({
                            width: 450,
                            height: 450,
                            fit: 'cover'
                        })
                        .png() 
                        .toFile(filepath);
                    updatedProductImages.push(`uploads/productImage/${filename}`);
                } catch (sharpError) {
                    console.error("Error processing image with sharp:", sharpError);
                    return res.status(400).json({
                        error: "image_processing_error",
                        message: "Failed to process uploaded image. The image format may not be supported."
                    });
                }
            }
        }

        if (updatedProductImages.length < 3) {
            return res.status(400).json({
                error: "insufficient_images",
                message: "Please upload at least 3 product images"
            });
        }
        let MAX_IMAGES = 8
        
        if (updatedProductImages.length > MAX_IMAGES) {
            return res.status(400).json({
                error: "too_many_images",
                message: `You can only upload a maximum of ${MAX_IMAGES} images`
            });
        }

        // Rest of the existing code...
        let categoryId;
        let categoryDoc;
        try {
            if (mongoose.Types.ObjectId.isValid(data.category)) {
                categoryDoc = await Category.findById(data.category);
                if (categoryDoc) {
                    categoryId = categoryDoc._id;
                } else {
                    return res.status(400).json({
                        error: "Invalid category ID"
                    });
                }
            } else {
                return res.status(400).json({
                    error: "Category must be a valid ID"
                });
            }
        } catch (catError) {
            console.error("Error finding category:", catError);
            return res.status(400).json({
                error: "Category error: " + catError.message
            });
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

        const regularPrice = parseFloat(data.regularPrice);
        const salePrice = parseFloat(data.salePrice);
        const productOffer = product.productOffer || 0;
        const categoryOffer = categoryDoc?.categoryOffer || 0;

        const calculatedSalePrice = calculateSalePrice(regularPrice, productOffer, categoryOffer);

        const finalSalePrice = Math.min(calculatedSalePrice, salePrice);

        const updatedFields = {
            productName: data.productName.trim(),
            description: data.description.trim(),
            category: categoryId,
            regularPrice: regularPrice,
            salePrice: finalSalePrice,
            sizes: sizeEntries,
            color: data.color.trim(),
            productImage: updatedProductImages
        };

        const updatedProduct = await Product.findByIdAndUpdate(id, updatedFields, {
            new: true
        });

        res.status(200).json({
            success: true,
            message: "Product updated successfully",
            redirectUrl: "/admin/products"
        });
    } catch (error) {
        console.error("Error saving edited data:", error);
        res.status(500).json({
            error: error.message
        });
    }
};

const deleteSingleImage = async (req, res) => {
    try {
        const {
            imageNmaeToServer,
            productIdToServer
        } = req.body;
        const product = await Product.findByIdAndUpdate(productIdToServer, {
            $pull: {
                productImage: imageNameToServer
            }
        });
        const imagePath = path.join("public", "uploads", "re-image", imageNameToServer);
        if (fs.existsSync(imagePath)) {
            await fs.unlinkSync(imagePath);
            // console.log(`Image ${imageNameToServer} deleted successfully`)
        } else {
            console.log(`Image ${imageNameToServer} not found`)
        }
        res.send({
            status: true
        });
    } catch (error) {
        res.redirect("/error-page")
    }
};

const blockProduct = async (req, res) => {
    try {
        const id = req.query.id;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                error: "Invalid product ID"
            });
        }

        await Product.updateOne({
            _id: id
        }, {
            $set: {
                isBlocked: true
            }
        });

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
            return res.status(400).json({
                error: "Invalid product ID"
            });
        }

        await Product.updateOne({
            _id: id
        }, {
            $set: {
                isBlocked: false
            }
        });

        res.redirect("/admin/products");
    } catch (error) {
        console.error("Error unblocking product:", error);
        res.redirect('/error-page');
    }
};

const addOffer = async (req, res) => {
    try {
        const {
            productId,
            offerPercentage
        } = req.body;

        if (!offerPercentage || offerPercentage < 1 || offerPercentage > 100) {
            return res.status(400).json({
                success: false,
                message: "Invalid offer percentage"
            });
        }

       
        const product = await Product.findById(productId).populate("category");
        if (!product) {
            return res.status(404).json({
                success: false,
                message: "Product not found"
            });
        }

      
        const categoryOffer = product.category ?.categoryOffer || 0;

       
        const calculatedSalePrice = calculateSalePrice(
            product.regularPrice,
            offerPercentage,
            categoryOffer
        );

        await Product.updateOne({
            _id: productId
        }, {
            productOffer: offerPercentage,
            salePrice: calculatedSalePrice
        });

        res.json({
            success: true
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

const removeOffer = async (req, res) => {
    try {
        const {
            productId
        } = req.body;

       
        const product = await Product.findById(productId).populate("category");
        if (!product) {
            return res.status(404).json({
                success: false,
                message: "Product not found"
            });
        }

    
        const categoryOffer = product.category ?.categoryOffer || 0;
        const calculatedSalePrice = calculateSalePrice(
            product.regularPrice,
            0,
            categoryOffer
        );

        await Product.updateOne({
            _id: productId
        }, {
            productOffer: 0,
            salePrice: calculatedSalePrice
        });

        res.json({
            success: true
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};


const updateProductSalePrices = async (categoryId) => {
    try {
      
        const products = await Product.find({
            category: categoryId
        });
        const category = await Category.findById(categoryId);

        if (!category) return;

        const categoryOffer = category.categoryOffer || 0;

       
        for (const product of products) {
            const productOffer = product.productOffer || 0;
            const calculatedSalePrice = calculateSalePrice(
                product.regularPrice,
                productOffer,
                categoryOffer
            );

            await Product.updateOne({
                _id: product._id
            }, {
                salePrice: calculatedSalePrice
            });
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