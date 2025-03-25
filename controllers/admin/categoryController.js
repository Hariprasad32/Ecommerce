const Category = require("../../models/categorySchema");
const Product = require("../../models/productSchema");
const mongoose = require("mongoose");

const categoryInfo = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 4;
        const skip = (page - 1) * limit;
        
        const searchQuery = req.query.search || "";
        const filter = searchQuery ? 
            { name: { $regex: new RegExp(searchQuery, 'i') } } : 
            {};

        const categoryData = await Category.find(filter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);


        const totalCategories = await Category.countDocuments(filter);
        const totalPages = Math.ceil(totalCategories / limit);
        
        res.render('category', {
            cat: categoryData,
            currentPage: page,
            totalPages: totalPages,
            totalCategories: totalCategories,
            page: "category",
            searchQuery: searchQuery 
        });

    } catch (error) {
        console.log(error);
        res.redirect("/error-page");
    }
};

const addCategory = async (req, res) => {
    const { name, description } = req.body;
    try {
        const existingCategory = await Category.findOne({ 
            name: { $regex: new RegExp(`^${name}$`, 'i') }
        });
        if (existingCategory) {
            return res.status(400).json({ error: "Category already exists" });
        }

        const newCategory = new Category({
            name,
            description,
        });

        await newCategory.save();
        return res.json({ message: "Category added successfully" });

    } catch (error) {
        console.log("server error", error);
        return res.status(500).json({ error: "Internal Server Error" });
    }
};

const addCategoryOffer = async (req, res) => {
    console.log("data recieved here");
    try {
        const percentage = parseInt(req.body.percentage);
        console.log("percentage", percentage);

        const categoryId = req.body.categoryId;
        const category = await Category.findById(categoryId);
        if (!category) {
            return res.status(404).json({ status: false, message: "Category not found" });
        }
        
        const products = await Product.find({ category: category._id });
        const hasProductOffer = products.some((product) => product.productOffer > percentage);

        if (hasProductOffer) {
            return res.json({ status: false, message: "Products within this category already have product offers" });
        }
        
        await Category.updateOne({ _id: categoryId }, { $set: { categoryOffer: percentage } });

        for (const product of products) {
            product.productOffer = 0;
            product.salePrice = product.regularPrice;
            await product.save();
        }

        res.json({ status: true });

    } catch (error) {
        res.status(400).json({ status: false, message: "Something went wrong" });
    }
};

const removeCategoryOffer = async (req, res) => {
    console.log("request reached here");
    
    try {
        const categoryId = req.body.categoryId;
        
        const category = await Category.findById(categoryId);

        if (!category) {
            return res.status(404).json({ status: false, message: "Category not found" });
        }

        const percentage = category.categoryOffer;
        const products = await Product.find({ category: category._id });
        if (products.length > 0) {
            for (const product of products) {
                product.salePrice += Math.floor(product.regularPrice * (percentage / 100));
                product.productOffer = 0; 
                await product.save();
            }   
        }
        
        category.categoryOffer = 0;
        await category.save();
        
        res.json({ status: true });
    } catch (error) {
        console.error("Error removing category offer:", error);
        return res.status(500).json({ status: false, message: "Internal server error" });
    }
};

const getListCategory = async (req, res) => {
    try {
        let id = req.query.id;
        await Category.updateOne({ _id: id }, { $set: { isListed: true } });
        res.redirect('/admin/category');
    } catch (error) {
        res.redirect("/error-page");
    }
};

const getUnlistCategory = async (req, res) => {
    try {
        let id = req.query.id;
        await Category.updateOne({ _id: id }, { $set: { isListed: false } });
        res.redirect('/admin/category');
    } catch (error) {
        res.redirect("/error-page");
    }
};

const getEditCategory = async (req, res) => {
    try {
        const id = req.query.id;
        console.log("id:", id);
        if (!id || !mongoose.Types.ObjectId.isValid(id)) {
            return res.redirect("/error-page?message=Invalid%20category%20ID");
        }
        const category = await Category.findOne({ _id: id });
        if (!category) {
            return res.redirect("/error-page?message=Category%20not%20found");
        }
        res.render("edit-Category", { category, page: "category" });
    } catch (error) {
        console.error("Error in getEditCategory:", error);
        res.redirect("/error-page?message=Server%20error");
    }
};

const editCategory = async (req, res) => {
    try {
        const { categoryName, description } = req.body;
        const id = req.params.id;
        // console.log("id:", id);
        // console.log("name:", categoryName);
        // console.log("description:", description);

        if (!id || !mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ error: "Invalid category ID" });
        }
        if (!categoryName) {
            return res.status(400).json({ error: "Category name is required" });
        }

       
        const existingCategory = await Category.findOne({
            name: { $regex: new RegExp(`^${categoryName}$`, 'i') }, 
            _id: { $ne: id } 
        });

        if (existingCategory) {
            return res.status(400).json({ error: "Category name already exists" });
        }

        const updatedCategory = await Category.updateOne(
            { _id: id },
            { $set: { name: categoryName, description } }
        );

        if (updatedCategory.nModified === 0) {
            return res.status(404).json({ error: "Category not found or no changes made" });
        }

        res.json({ success: "Category updated successfully" });
    } catch (error) {
        console.error("Error in editCategory:", error);
        res.status(500).json({ error: "Server error" });
    }
};

module.exports = {
    categoryInfo,
    addCategory,
    addCategoryOffer,
    removeCategoryOffer,
    getListCategory,
    getUnlistCategory,
    getEditCategory,
    editCategory
};