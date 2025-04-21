const User = require('../../models/userSchema');
const Order = require('../../models/orderSchema');
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');



const loadLogin = async (req, res) => {
    try {
        if (req.session.admin) {
            return res.redirect("/admin/dashboard");
        }
        return res.render("admin-login", {
            message: null 
        });
    } catch (error) {
        console.log("Admin login error:", error);
        res.redirect('/error-page');
    }
};

const login = async (req, res) => {
    try {
        const {
            email,
            password
        } = req.body;


        const admin = await User.findOne({
            email,
            isAdmin: true
        });

        if (!admin) {
            return res.status(401).json({
                success: false,
                message: "Invalid email or not an admin"
            });
        }


        const isMatch = await bcrypt.compare(password, admin.password);
        if (!isMatch) {
            return res.status(401).json({
                success: false,
                message: "Invalid password"
            });
        }


        if (admin.isBlocked) {
            return res.status(403).json({
                success: false,
                message: "Admin account is blocked"
            });
        }


        req.session.admin = admin._id.toString();
        console.log("Session admin set to:", req.session.admin);


        return res.status(200).json({
            success: true,
            message: "Login successful",
            redirect: "/admin/dashboard"
        });

    } catch (error) {
        console.log("Login error:", error);
        return res.status(500).json({
            success: false,
            message: "Internal server error"
        });
    }
};

const loadDashboard = async (req, res) => {
    if (!req.session.admin) {
        return res.redirect("/admin/login");
    }

    try {
        const now = new Date();
        const lastMonth = new Date(now - 30 * 24 * 60 * 60 * 1000);
        const yesterday = new Date(now - 24 * 60 * 60 * 1000);


        const revenueData = await Order.aggregate([{
                $match: {
                    orderStatus: {
                        $in: ['Delivered', 'Shipped']
                    }
                }
            },
            {
                $group: {
                    _id: null,
                    current: {
                        $sum: '$totalAmount'
                    },
                    lastMonth: {
                        $sum: {
                            $cond: [{
                                $gte: ['$orderDate', lastMonth]
                            }, '$totalAmount', 0]
                        }
                    }
                }
            }
        ]);
        const totalRevenue = revenueData[0] ?.current || 0;
        const revenueLastMonth = revenueData[0] ?.lastMonth || 0;
        const revenueTrend = revenueLastMonth > 0 ? ((totalRevenue - revenueLastMonth) / revenueLastMonth * 100).toFixed(1) : 0;


        const newCustomersData = await User.aggregate([{
                $match: {
                    isAdmin: false
                }
            },
            {
                $group: {
                    _id: null,
                    current: {
                        $sum: 1
                    },
                    lastMonth: {
                        $sum: {
                            $cond: [{
                                $gte: ['$createdOn', lastMonth]
                            }, 1, 0]
                        }
                    }
                }
            }
        ]);
        const totalNewCustomers = newCustomersData[0] ?.lastMonth || 0;
        const customersLastMonth = newCustomersData[0] ?.current - totalNewCustomers || 0;
        const customersTrend = customersLastMonth > 0 ? ((totalNewCustomers - customersLastMonth) / customersLastMonth * 100).toFixed(1) : 0;


        const activeOrdersData = await Order.aggregate([{
                $match: {
                    orderStatus: {
                        $in: ['Processing', 'Shipped']
                    }
                }
            },
            {
                $group: {
                    _id: null,
                    current: {
                        $sum: 1
                    },
                    lastMonth: {
                        $sum: {
                            $cond: [{
                                $gte: ['$orderDate', lastMonth]
                            }, 1, 0]
                        }
                    }
                }
            }
        ]);
        const totalActiveOrders = activeOrdersData[0] ?.current || 0;
        const activeOrdersLastMonth = activeOrdersData[0] ?.lastMonth || 0;
        const activeOrdersTrend = activeOrdersLastMonth > 0 ? ((totalActiveOrders - activeOrdersLastMonth) / activeOrdersLastMonth * 100).toFixed(1) : 0;


        const pendingOrdersData = await Order.aggregate([{
                $match: {
                    orderStatus: 'Pending'
                }
            },
            {
                $group: {
                    _id: null,
                    current: {
                        $sum: 1
                    },
                    yesterday: {
                        $sum: {
                            $cond: [{
                                $gte: ['$orderDate', yesterday]
                            }, 1, 0]
                        }
                    }
                }
            }
        ]);
        const totalPendingOrders = pendingOrdersData[0] ?.current || 0;
        const pendingOrdersYesterday = pendingOrdersData[0] ?.yesterday || 0;
        const pendingOrdersTrend = totalPendingOrders - pendingOrdersYesterday;


        const recentOrders = await Order.find({})
            .populate('userId', 'name')
            .sort({
                orderDate: -1
            })
            .limit(5)
            .lean();

        console.log("recentOrders", recentOrders);


        return res.render("dashboard", {
            page: "overview",
            sales: [],
            totalSales: 0,
            totalOrderCount: 0,
            totalDiscount: 0,
            period: 'all',
            startDate: '',
            endDate: '',
            currentPage: 1,
            totalPages: 1,
            totalRevenue,
            revenueTrend,
            totalNewCustomers,
            customersTrend,
            totalActiveOrders,
            activeOrdersTrend,
            totalPendingOrders,
            pendingOrdersTrend,
            recentOrders
        });
    } catch (error) {
        console.error("Error loading dashboard:", error);
        return res.redirect("/admin/error-page");
    }
};

const loadSalesReport = async (req, res) => {
    if (!req.session.admin) {
        console.log("Redirecting to login due to no admin session");
        return res.redirect("/admin/login");
    }

    try {
        const period = req.query.period || 'all';
        const startDate = req.query.startDate || '';
        const endDate = req.query.endDate || '';
        const page = parseInt(req.query.page) || 1;
        const limit = 10;
        const download = req.query.download;

       
        let dateFilter = {};
        const now = new Date();

        switch (period) {
            case '1day':
                dateFilter = {
                    orderDate: {
                        $gte: new Date(now - 24 * 60 * 60 * 1000)
                    }
                };
                break;
            case '1week':
                dateFilter = {
                    orderDate: {
                        $gte: new Date(now - 7 * 24 * 60 * 60 * 1000)
                    }
                };
                break;
            case '1month':
                dateFilter = {
                    orderDate: {
                        $gte: new Date(now - 30 * 24 * 60 * 60 * 1000)
                    }
                };
                break;
            case 'custom':
                if (startDate && endDate) {
                    dateFilter = {
                        orderDate: {
                            $gte: new Date(startDate),
                            $lte: new Date(endDate)
                        }
                    };
                }
                break;
            case 'all':
            default:
                dateFilter = {};
                break;
        }

       
        const matchDeliveredItems = {
            ...dateFilter,
            'items.status': 'Delivered'
        };

      
        const totalSalesData = await Order.aggregate([
            {
                $match: matchDeliveredItems
            },
            {
                $unwind: '$items'
            },
            {
                $match: {
                    'items.status': 'Delivered'
                }
            },
            {
                $group: {
                    _id: null,
                    totalSales: {
                        $sum: '$items.finalPrice'
                    },
                    totalDiscount: {
                        $sum: {
                            $add: [
                                '$couponDiscount',
                                '$items.discount'
                            ]
                        }
                    },
                    totalOrderCount: {
                        $addToSet: '$_id'
                    }
                }
            },
            {
                $project: {
                    totalSales: 1,
                    totalDiscount: 1,
                    totalOrderCount: { $size: '$totalOrderCount' }
                }
            }
        ]);

        const totalSales = totalSalesData[0]?.totalSales || 0;
        const totalDiscount = totalSalesData[0]?.totalDiscount || 0;
        const totalOrderCount = totalSalesData[0]?.totalOrderCount || 0;

      
        const totalOrders = await Order.countDocuments(matchDeliveredItems);
        const totalPages = Math.ceil(totalOrders / limit);
        console.log("Total pages:", totalPages);

      
        if (download) {
          
            const allSales = await Order.find(matchDeliveredItems)
                .populate('userId', 'name')
                .sort({ orderDate: -1 })
                .lean();

            const totals = {
                totalSales,
                totalOrderCount,
                totalDiscount
            };

            if (download === 'pdf') {
                return generatePDF(res, allSales, totals, period, startDate, endDate);
            } else if (download === 'excel') {
                return generateExcel(res, allSales, totals, period, startDate, endDate);
            }
        }

       
        const sales = await Order.find(matchDeliveredItems)
            .populate('userId', 'name')
            .sort({ orderDate: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .lean();

        console.log("Paginated sales:", sales);

        if (req.xhr || req.query.ajax) {
            return res.json({
                sales,
                totalSales,
                totalOrderCount,
                totalDiscount,
                period,
                startDate,
                endDate,
                currentPage: page,
                totalPages
            });
        }

        
        return res.render("admin/dashboard", {
            page: "reports",
            sales,
            totalSales,
            totalOrderCount,
            totalDiscount,
            period,
            startDate,
            endDate,
            currentPage: page,
            totalPages,
            totalRevenue: 0,
            revenueTrend: 0,
            totalNewCustomers: 0,
            customersTrend: 0,
            totalActiveOrders: 0,
            activeOrdersTrend: 0,
            totalPendingOrders: 0,
            pendingOrdersTrend: 0,
            recentOrders: []
        });
    } catch (error) {
        console.error("Error loading sales report:", error);
        if (req.query.download === 'pdf' || req.query.download === 'excel') {
            res.status(500).end(`Error generating ${req.query.download.toUpperCase()}`);
        } else if (req.xhr || req.query.ajax) {
            return res.status(500).json({
                error: "Internal server error"
            });
        }
        return res.redirect("/admin/error-page");
    }
};


function generateExcel(res, orders, totals, period, startDate, endDate) {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Wear Aura Sales Report');
    
   
    worksheet.mergeCells('A1:H1');
    const titleCell = worksheet.getCell('A1');
    titleCell.value = 'Wear Aura Sales Report - Delivered Items';
    titleCell.font = { size: 16, bold: true };
    titleCell.alignment = { horizontal: 'center' };
    
    
    worksheet.mergeCells('A2:H2');
    const dateCell = worksheet.getCell('A2');
    dateCell.value = `Report generated on: ${new Date().toLocaleString()}`;
    dateCell.alignment = { horizontal: 'center' };
    
    
    worksheet.mergeCells('A3:H3');
    const periodCell = worksheet.getCell('A3');
    const periodMap = {
        '1day': 'Last 24 Hours',
        '1week': 'Last 7 Days',
        '1month': 'Last 30 Days',
        'custom': `${startDate} to ${endDate}`,
        'all': 'All Time'
    };
    periodCell.value = `Period: ${periodMap[period] || 'All Time'}`;
    periodCell.alignment = { horizontal: 'center' };
    
    
    worksheet.mergeCells('A5:C5');
    worksheet.getCell('A5').value = 'Summary';
    worksheet.getCell('A5').font = { bold: true };
    
    worksheet.getCell('A6').value = 'Total Revenue:';
    worksheet.getCell('B6').value = `₹${totals.totalSales.toLocaleString()}`;
    
    worksheet.getCell('A7').value = 'Total Orders:';
    worksheet.getCell('B7').value = totals.totalOrderCount;
    
    worksheet.getCell('A8').value = 'Total Discount:';
    worksheet.getCell('B8').value = `₹${totals.totalDiscount.toLocaleString()}`;
    
    
    const headers = [
        'Order ID',
        'Customer Name',
        'Date',
        'Delivered Items',
        'Price',
        'Discount',
        'Amount',
        'Status',
        'Payment Method'
    ];
    
    worksheet.addRow([]);
    worksheet.addRow([]);
    const headerRow = worksheet.addRow(headers);
    headerRow.eachCell((cell) => {
        cell.font = { bold: true };
        cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF3A86FF' }
        };
        cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' }
        };
        cell.color = { argb: 'FFFFFFFF' };
    });
    
    
    orders.forEach(order => {
        const deliveredItems = order.items.filter(item => item.status === 'Delivered');
        const itemsCount = deliveredItems.length;
        const itemTotal = deliveredItems.reduce((sum, item) => sum + (item.finalPrice || 0), 0);
        const itemDiscount = deliveredItems.reduce((sum, item) => sum + (item.discount || 0), 0);
        const totalDiscount = (order.couponDiscount || 0) + itemDiscount;
        
        worksheet.addRow([
            order.orderId || 'N/A',
            order.userId ? order.userId.name : 'Unknown',
            order.orderDate ? new Date(order.orderDate).toLocaleDateString() : 'N/A',
            itemsCount,
            `₹${itemTotal.toLocaleString()}`,
            `₹${totalDiscount.toLocaleString()}`,
            `₹${itemTotal.toLocaleString()}`,
            order.orderStatus || 'N/A',
            order.paymentMethod || 'N/A'
        ]);
    });
    
    
    worksheet.eachRow((row, rowNumber) => {
        if (rowNumber > 11) { 
            row.eachCell((cell) => {
                cell.border = {
                    top: { style: 'thin' },
                    left: { style: 'thin' },
                    bottom: { style: 'thin' },
                    right: { style: 'thin' }
                };
            });
        }
    });
    
    
    worksheet.columns.forEach((column, i) => {
        let maxLength = 0;
        column.eachCell({ includeEmpty: true }, (cell) => {
            const columnLength = cell.value ? cell.value.toString().length : 10;
            if (columnLength > maxLength) {
                maxLength = columnLength;
            }
        });
        column.width = maxLength < 10 ? 10 : maxLength + 2;
    });
    
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=wear-aura-sales-report.xlsx');
    
    
    return workbook.xlsx.write(res)
        .then(() => {
            res.end();
        });
}


function generatePDF(res, orders, totals, period, startDate, endDate) {
    const doc = new PDFDocument({
        size: 'A4',
        margin: 50
    });
    res.setHeader('Content-Disposition', 'attachment; filename="wear-aura-sales-report.pdf"');
    res.setHeader('Content-Type', 'application/pdf');
    doc.pipe(res);

    doc.fontSize(24).text('Wear Aura', {
        align: 'center'
    });
    doc.fontSize(18).text('Sales Report - Delivered Items', {
        align: 'center'
    });
    doc.fontSize(10).text(`Generated on: ${new Date().toLocaleDateString()}`, {
        align: 'right'
    });
    doc.moveDown();

    const periodMap = {
        '1day': 'Last 24 Hours',
        '1week': 'Last 7 Days',
        '1month': 'Last 30 Days',
        'custom': `${startDate} to ${endDate}`,
        'all': 'All Time'
    };
    doc.fontSize(12).text(`Period: ${periodMap[period] || 'All Time'}`, {
        align: 'left'
    });
    doc.moveDown();

    const tableTop = doc.y + 20;
    const columns = [
        {
            header: 'Order ID',
            width: 90,
            key: 'orderId',
            align: 'center',
            renderer: v => v.substring(0, 8) + '...'
        },
        {
            header: 'Customer',
            width: 80,
            key: 'userId',
            align: 'left',
            renderer: v => v?.name || 'Unknown'
        },
        {
            header: 'Date',
            width: 70,
            key: 'orderDate',
            align: 'center',
            renderer: v => new Date(v).toLocaleDateString()
        },
        {
            header: 'Delivered Items',
            width: 60,
            key: 'items',
            align: 'center',
            renderer: v => v.filter(item => item.status === 'Delivered').length.toString()
        },
        {
            header: 'Price',
            width: 70,
            key: 'items',
            align: 'right',
            renderer: v => {
                const total = v.filter(item => item.status === 'Delivered').reduce((sum, item) => sum + (item.finalPrice || 0), 0);
                return `₹${total.toLocaleString()}`;
            }
        },
        {
            header: 'Discount',
            width: 70,
            key: 'discount',
            align: 'right',
            renderer: (v, sale) => {
                const itemDiscount = sale.items.filter(item => item.status === 'Delivered').reduce((sum, item) => sum + (item.discount || 0), 0);
                const total = (sale.couponDiscount || 0) + itemDiscount;
                return `₹${total.toLocaleString()}`;
            }
        },
        {
            header: 'Amount',
            width: 70,
            key: 'items',
            align: 'right',
            renderer: v => {
                const total = v.filter(item => item.status === 'Delivered').reduce((sum, item) => sum + (item.finalPrice || 0), 0);
                return `₹${total.toLocaleString()}`;
            }
        },
        {
            header: 'Order Status',
            width: 60,
            key: 'orderStatus',
            align: 'center',
            renderer: v => v || 'N/A'
        },
    ];

    const tableWidth = columns.reduce((acc, col) => acc + col.width, 0);
    const tableX = (doc.page.width - tableWidth) / 2;

    doc.font('Helvetica-Bold').fontSize(10);
    let x = tableX;
    columns.forEach(col => {
        doc.text(col.header, x, tableTop, {
            width: col.width,
            align: col.align
        });
        x += col.width;
    });

    doc.font('Helvetica');
    let y = tableTop + 20;

    if (orders.length === 0) {
        doc.text('No orders with delivered items found for this period.', tableX, y, {
            width: tableWidth,
            align: 'center'
        });
        y += 30;
    } else {
        for (const sale of orders) {
            x = tableX;
            columns.forEach(col => {
                const value = col.key.includes('.') ?
                    sale[col.key.split('.')[0]]?.[col.key.split('.')[1]] :
                    sale[col.key];

                doc.text(
                    col.renderer(value, sale),
                    x,
                    y, {
                        width: col.width,
                        align: col.align
                    }
                );
                x += col.width;
            });

            y += 20;
            if (y > doc.page.height - 100) {
                doc.addPage();
                y = 50;

                doc.font('Helvetica-Bold').fontSize(10);
                x = tableX;
                columns.forEach(col => {
                    doc.text(col.header, x, y, {
                        width: col.width,
                        align: col.align
                    });
                    x += col.width;
                });
                y += 20;
                doc.font('Helvetica');
            }
        }
    }

    y += 30;
    doc.rect(tableX, y, tableWidth, 80).stroke();

    doc.font('Helvetica-Bold').fontSize(12).text('Order Summary', tableX, y + 10, {
        width: tableWidth,
        align: 'center'
    });

    doc.font('Helvetica').fontSize(10);
    doc.text(`Total Orders: ${totals.totalOrderCount}`, tableX + 20, y + 35);
    doc.text(`Total Discount: ₹${totals.totalDiscount.toLocaleString()}`, tableX + 20, y + 55);
    doc.text(`Total Sales: ₹${totals.totalSales.toLocaleString()}`, tableX + (tableWidth / 2) + 20, y + 35);

    doc.fontSize(8).text('Wear Aura © 2025 - All Rights Reserved', tableX, y + 90, {
        width: tableWidth,
        align: 'center'
    });

    doc.end();
}

const logout = async (req, res) => {
    try {
        console.log(req.session.admin)
        req.session.admin = undefined;
        req.adminData = undefined;
        res.redirect('/admin/login')

    } catch (error) {

        console.log("error during destroying session");


    }
}

const errorPage = async (req, res) => {
    try {
        return res.render("error-page")
    } catch (error) {
        console.log("error during loading 404 page");
        return res.status(500).send("Internal server error")
    }
}

module.exports = {
    loadLogin,
    login,
    loadDashboard,
    logout,
    errorPage,
    loadSalesReport
};