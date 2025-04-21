const Product = require("../../models/productSchema");
const Category = require("../../models/categorySchema");
const User = require("../../models/userSchema");
const Coupon = require("../../models/couponSchema");
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const mongoose = require('mongoose');

const getAdminCoupons = async (req, res) => {
    try {
        const userId = req.session.admin;
        if (!userId) {
            return res.redirect('/admin/login');
        }

        const user = await User.findById(userId).lean();
        if (!user || !user.isAdmin) { 
            return res.status(403).send('Unauthorized');
        }

        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 5;
        const skip = (page - 1) * limit;
        const search = req.query.search || '';
        const sortBy = req.query.sortBy || 'createdOn';
        const sortOrder = req.query.sortOrder === 'desc' ? -1 : 1;
        const status = req.query.status || '';

        
        await Coupon.updateMany(
            {
                expireOn: { $lt: new Date() },
                isListed: true,
                isDeleted: false
            },
            { isListed: false }
        );

        let query = { isDeleted: false };
        if (search) {
            const searchRegex = new RegExp(search, 'i');
            query.name = searchRegex;
        }
        if (status) {
            query.isListed = status === 'active';
        }

        const totalCoupons = await Coupon.countDocuments(query);
        const coupons = await Coupon.find(query)
            .sort({ [sortBy]: sortOrder })
            .skip(skip)
            .limit(limit)
            .lean();

        const totalPages = Math.ceil(totalCoupons / limit);

        res.render('coupon', {
            coupons: coupons || [],
            currentPage: page,
            totalPages: totalPages,
            totalCoupons: totalCoupons,
            page: 'Coupons',
            search: search,        
            sortBy: sortBy,
            sortOrder: sortOrder,
            status: status        
        });

    } catch (error) {
        console.error("Error fetching admin coupons:", error);
        res.status(500).render('admin/error', {
            message: 'Server error while loading coupons',
            status: 500
        });
    }
};

const addCoupon = async (req, res) => {
    try {
        const { couponName, startDate, expiryDate, offerPrice, minimumPrice } = req.body;

        if (!couponName || !startDate || !expiryDate || !offerPrice || !minimumPrice) {
            return res.status(400).json({ success: false, message: 'All fields are required' });
        }

        const couponRegex = /^[a-zA-Z0-9-]{3,20}$/;
        if (!couponRegex.test(couponName)) {
            return res.status(400).json({ success: false, message: 'Invalid coupon format' });
        }

        if (new Date(startDate) >= new Date(expiryDate)) {
            return res.status(400).json({ success: false, message: 'Start date must be before expiry date' });
        }

        const offer = Number(offerPrice);
        const minPrice = Number(minimumPrice);
        if (offer <= 0 || minPrice <= 0 || minPrice < offer) {
            return res.status(400).json({ success: false, message: 'Invalid pricing: Minimum price must be >= offer price' });
        }

        const existingCoupon = await Coupon.findOne({ name: couponName });
        if (existingCoupon) {
            if (existingCoupon.isDeleted) {
                existingCoupon.createdOn = new Date(startDate);
                existingCoupon.expireOn = new Date(expiryDate);
                existingCoupon.offerPrice = offer;
                existingCoupon.minimumPrice = minPrice;
                existingCoupon.isListed = new Date(expiryDate) > new Date(); 
                existingCoupon.isDeleted = false;
                await existingCoupon.save();
                return res.status(200).json({ success: true, message: 'Coupon reactivated successfully' });
            }
            return res.status(400).json({ success: false, message: 'Coupon code already exists' });
        }

        const newCoupon = new Coupon({
            name: couponName,
            createdOn: new Date(startDate), 
            expireOn: new Date(expiryDate),
            offerPrice: offer,
            minimumPrice: minPrice,
            isListed: new Date(expiryDate) > new Date(),
            userId: null, 
            isDeleted: false 
        });

        await newCoupon.save();
        res.status(200).json({ success: true, message: 'Coupon created successfully' });

    } catch (error) {
        console.error("Error adding coupon:", error);
        res.status(500).json({ success: false, message: 'Server error while adding coupon' });
    }
};

const getCouponDetails = async (req, res) => {
    try {
        console.log("Fetching coupon details for:", req.params.couponName);
        const couponName = req.params.couponName;
        
       
        await Coupon.updateOne(
            {
                name: couponName,
                expireOn: { $lt: new Date() },
                isListed: true,
                isDeleted: false
            },
            { isListed: false }
        );

        const coupon = await Coupon.findOne({ name: couponName, isDeleted: false }).lean();

        if (!coupon) {
            return res.status(404).json({ success: false, message: 'Coupon not found' });
        }

        res.status(200).json({ success: true, coupon });

    } catch (error) {
        console.error("Error fetching coupon details:", error);
        res.status(500).json({ success: false, message: 'Server error while fetching coupon details' });
    }
};

const editCoupon = async (req, res) => {
    try {
        console.log("Editing coupon with data:", req.body);
        const { couponName, startDate, expiryDate, offerPrice, minimumPrice } = req.body;

        if (!couponName || !startDate || !expiryDate || !offerPrice || !minimumPrice) {
            return res.status(400).json({ success: false, message: 'All fields are required' });
        }

        const couponRegex = /^[a-zA-Z0-9-]{3,20}$/;
        if (!couponRegex.test(couponName)) {
            return res.status(400).json({ success: false, message: 'Invalid coupon format' });
        }

        if (new Date(startDate) >= new Date(expiryDate)) {
            return res.status(400).json({ success: false, message: 'Start date must be before expiry date' });
        }

        const offer = Number(offerPrice);
        const minPrice = Number(minimumPrice);
        if (offer <= 0 || minPrice <= 0 || minPrice < offer) {
            return res.status(400).json({ success: false, message: 'Invalid pricing: Minimum price must be >= offer price' });
        }

        const updatedCoupon = await Coupon.findOneAndUpdate(
            { name: couponName, isDeleted: false },
            {
                createdOn: new Date(startDate),
                expireOn: new Date(expiryDate),
                offerPrice: offer,
                minimumPrice: minPrice,
                isListed: new Date(expiryDate) > new Date() 
            },
            { new: true }
        );

        if (!updatedCoupon) {
            return res.status(404).json({ success: false, message: 'Coupon not found' });
        }

        res.status(200).json({ success: true, message: 'Coupon updated successfully' });

    } catch (error) {
        console.error("Error editing coupon:", error);
        res.status(500).json({ success: false, message: 'Server error while editing coupon' });
    }
};

const deleteCoupon = async (req, res) => {
    try {
        const { couponName } = req.body;
        console.log("Soft-deleting coupon with data:", couponName);

        if (!couponName) {
            return res.status(400).json({ success: false, message: 'Coupon name is required' });
        }

        const updatedCoupon = await Coupon.findOneAndUpdate(
            { name: couponName, isDeleted: false },
            { isDeleted: true },
            { new: true }
        );

        if (!updatedCoupon) {
            return res.status(404).json({ success: false, message: 'Coupon not found' });
        }

        res.status(200).json({ success: true, message: 'Coupon deleted successfully' });

    } catch (error) {
        console.error("Error deleting coupon:", error);
        res.status(500).json({ success: false, message: 'Server error while deleting coupon' });
    }
};

module.exports = {
    getAdminCoupons,
    addCoupon,
    getCouponDetails,
    editCoupon,
    deleteCoupon
};