const Order = require('../../models/orderSchema');
const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');



const getDateRange = (timePeriod,year,month,week) =>{
    const startDate = new Date();
    const endDate = new Date();

    if (timePeriod === 'yearly') {
        startDate.setFullYear(parseInt(year), 0, 1);
        endDate.setFullYear(parseInt(year) + 1, 0, 1);
      } else if (timePeriod === 'monthly') {
        startDate.setFullYear(parseInt(year), parseInt(month), 1);
        endDate.setFullYear(parseInt(year), parseInt(month) + 1, 1);
      } else if (timePeriod === 'weekly') {
        startDate.setFullYear(parseInt(year), parseInt(month), 1 + (parseInt(week) - 1) * 7);
        endDate.setDate(startDate.getDate() + 7);
      } else if (timePeriod === 'daily') {
        startDate.setFullYear(parseInt(year), parseInt(month), 1 + (parseInt(week) - 1) * 7);
        endDate.setDate(startDate.getDate() + 1);
      }
    
      return { startDate, endDate };

};



const getTopProducts = async (req,res) =>{
    const { timePeriod = 'monthly', year = new Date().getFullYear(), month = new Date().getMonth(), week } = req.query;
    const { startDate, endDate } = getDateRange(timePeriod, year, month, week);

    try {
        const topProducts = await Order.aggregate([
            { 
                $match: { 
                  orderDate: { $gte: startDate, $lt: endDate }, 
                  orderStatus: { $nin: ['Cancelled', 'Returned'] } 
                } 
              },
              { $unwind: '$items' },
              {
                $group: {
                  _id: '$items.productId',
                  totalUnits: { $sum: '$items.quantity' },
                  totalRevenue: { $sum: { $multiply: ['$items.quantity', '$items.finalPrice'] } },
                },
              },
              { $sort: { totalUnits: -1 } },
              { $limit: 10 },
              {
                $lookup: {
                  from: 'products',
                  localField: '_id',
                  foreignField: '_id',
                  as: 'product',
                },
              },
              { $unwind: '$product' },
              {
                $project: {
                  name: '$product.productName',
                  unitsSold: '$totalUnits',
                  revenue: '$totalRevenue',
                },
              },
        ])

        res.status(200).json(topProducts);
    } catch (error) {
        console.error('Error fetching top products:', error);
        res.status(500).json({ error: 'Failed to fetch top products' });
        
    }
}


const getTopCategories = async(req,res) =>{
    const { timePeriod = 'monthly', year = new Date().getFullYear(), month = new Date().getMonth(), week } = req.query;
  const { startDate, endDate } = getDateRange(timePeriod, year, month, week);

  try {
    const topCategories = await Order.aggregate([
      { 
        $match: { 
          orderDate: { $gte: startDate, $lt: endDate }, 
          orderStatus: { $nin: ['Cancelled', 'Returned'] } 
        } 
      },
      { $unwind: '$items' },
      {
        $lookup: {
          from: 'products',
          localField: 'items.productId',
          foreignField: '_id',
          as: 'product',
        },
      },
      { $unwind: '$product' },
      {
        $group: {
          _id: '$product.category',
          totalRevenue: { $sum: { $multiply: ['$items.quantity', '$items.finalPrice'] } },
        },
      },
      { $sort: { totalRevenue: -1 } },
      { $limit: 10 },
      {
        $lookup: {
          from: 'categories',
          localField: '_id',
          foreignField: '_id',
          as: 'category',
        },
      },
      { $unwind: '$category' },
      {
        $project: {
          name: '$category.name',
          revenue: '$totalRevenue',
        },
      },
    ]);

    res.status(200).json(topCategories);
  } catch (error) {
    console.error('Error fetching top categories:', error);
    res.status(500).json({ error: 'Failed to fetch top categories' });
  }
};


const getSalesOverTime = async (req, res) => {
  const { timePeriod = 'monthly' } = req.query;

  try {
      let groupBy;
      if (timePeriod === 'yearly') {
          groupBy = {
              year: { $year: '$orderDate' }
          };
      } else if (timePeriod === 'monthly') {
          groupBy = {
              year: { $year: '$orderDate' },
              month: { $month: '$orderDate' }
          };
      } else if (timePeriod === 'weekly') {
          groupBy = {
              year: { $year: '$orderDate' },
              month: { $month: '$orderDate' },
              week: { $week: '$orderDate' }
          };
      } else if (timePeriod === 'daily') {
          groupBy = {
              year: { $year: '$orderDate' },
              month: { $month: '$orderDate' },
              day: { $dayOfMonth: '$orderDate' }
          };
      }

      const salesOverTime = await Order.aggregate([
          { 
              $match: { 
                  orderStatus: { $nin: ['Cancelled', 'Returned'] } 
              } 
          },
          {
              $group: {
                  _id: groupBy,
                  totalRevenue: { $sum: '$totalAmount' }
              }
          },
          { 
              $sort: { 
                  '_id.year': 1,
                  '_id.month': 1,
                  '_id.week': 1,
                  '_id.day': 1
              } 
          },
          {
              $project: {
                  _id: timePeriod === 'yearly' ? '$_id.year' : timePeriod === 'monthly' ? '$_id.month' : timePeriod === 'weekly' ? '$_id.week' : '$_id.day',
                  year: '$_id.year',
                  month: '$_id.month',
                  day: '$_id.day',
                  totalRevenue: 1
              }
          }
      ]);

      res.status(200).json(salesOverTime);
  } catch (error) {
      console.error('Error fetching sales over time:', error);
      res.status(500).json({ error: 'Failed to fetch sales over time' });
  }
};


  module.exports ={
    getTopProducts,
    getTopCategories,
    getSalesOverTime
  }