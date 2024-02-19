const express = require('express');
const mongoose = require('mongoose');
const axios = require('axios');
const { Schema } = mongoose;
const app = express();
const PORT = process.env.PORT || 3000;

// Connecting to mongodb
mongoose.connect('mongodb://localhost:27017/mydb', {})
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('Error connecting to MongoDB:', err));

// Building Schema 
const productSchema = new Schema({
  id: Number,
  title: String,
  price: { type: Number, required: true },
  description: String,
  category: String,
  image: String,
  sold: Boolean,
  dateOfSale: Date
});

const Product = mongoose.model('Product', productSchema);


// 1st API to Initialize-database
/*
GET
Create API to initialize the database. fetch the JSON from the third party API and
initialize the database with seed data. You are free to define your own efficient table /
collection structure
*/

app.get('/initialize-database', async (req, res) => {
  try {
    const response = await axios.get('https://s3.amazonaws.com/roxiler.com/product_transaction.json');
    const jsonData = response.data;
    console.log('Fetched JSON data:', jsonData);
    await Product.insertMany(jsonData);
    console.log('Database initialized successfully');
    res.json({ message: 'Database initialized successfully' });
  } catch (error) {
    console.error('Error fetching or inserting data:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// 2nd API to list the all transactions
/*
GET
Create an API to list the all transactions
- API should support search and pagination on product transactions
- Based on the value of search parameters, it should match search text on product
title/description/price and based on matching result it should return the product
transactions
- If search parameter is empty then based on applied pagination it should return all the
records of that page number
- Default pagination values will be like page = 1, per page = 10
*/

app.get('/transactions', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const perPage = parseInt(req.query.perPage) || 10;
    const search = req.query.search || '';
    const month = req.query.month;

    if (!/^(January|February|March|April|May|June|July|August|September|October|November|December)$/i.test(month)) {
      return res.status(400).json({ error: 'Invalid month parameter. Expected values: January to December' });
    }

    const transactions = await Product.find({
      $and: [
        { $expr: { $eq: [{ $month: '$dateOfSale' }, new Date(month + ' 1, 2022').getMonth() + 1] } },
        { $or: [
            { title: { $regex: search, $options: 'i' } },
            { description: { $regex: search, $options: 'i' } }
          ]
        }
      ]
    }).skip((page - 1) * perPage).limit(perPage);

    const validTransactions = transactions.filter(transaction => typeof transaction.price === 'number');

    const totalTransactions = validTransactions.length;

    res.json({
      transactions: validTransactions,
      totalTransactions,
      currentPage: page,
      totalPages: Math.ceil(totalTransactions / perPage)
    });
  } catch (error) {
    console.error('Error fetching transactions:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// 3rd API for statistics
/*
GET
Create an API for statistics
- Total sale amount of selected month
- Total number of sold items of selected month
- Total number of not sold items of selected month
*/

app.get('/statistics', async (req, res) => {
    try {
        const month = req.query.month;

        if (!/^(January|February|March|April|May|June|July|August|September|October|November|December)$/i.test(month)) {
            return res.status(400).json({ error: 'Invalid month parameter. Expected values: January to December' });
        }

        const totalSaleAmount = await Product.aggregate([
            {
                $match: {
                    $expr: {
                        $and: [
                            { $eq: [{ $month: '$dateOfSale' }, new Date(month + ' 1, 2022').getMonth() + 1] },
                            { sold: true }
                        ]
                    }
                }
            },
            {
                $group: {
                    _id: null,
                    totalAmount: { $sum: '$price' }
                }
            }
        ]);

        const totalSoldItems = await Product.countDocuments({
            $and: [
                { $expr: { $eq: [{ $month: '$dateOfSale' }, new Date(month + ' 1, 2022').getMonth() + 1] } },
                { sold: true }
            ]
        });

        const totalUnsoldItems = await Product.countDocuments({
            $and: [
                { $expr: { $eq: [{ $month: '$dateOfSale' }, new Date(month + ' 1, 2022').getMonth() + 1] } },
                { sold: false }
            ]
        });

        res.json({
            totalSaleAmount: totalSaleAmount.length > 0 ? totalSaleAmount[0].totalAmount : 0,
            totalSoldItems,
            totalUnsoldItems
        });
    } catch (error) {
        console.error('Error fetching statistics:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});


// 4th API for bar chart
/*
GET
Create an API for bar chart ( the response should contain price range and the number
of items in that range for the selected month regardless of the year )
- 0 - 100
- 101 - 200
- 201-300
- 301-400
- 401-500
- 501 - 600
- 601-700
- 701-800
- 801-900
- 901-above
*/

app.get('/bar-chart', async (req, res) => {
    try {
        const month = req.query.month;

        if (!/^(January|February|March|April|May|June|July|August|September|October|November|December)$/i.test(month)) {
            return res.status(400).json({ error: 'Invalid month parameter. Expected values: January to December' });
        }

        const priceRanges = [
            { min: 0, max: 100 },
            { min: 101, max: 200 },
            { min: 201, max: 300 },
            { min: 301, max: 400 },
            { min: 401, max: 500 },
            { min: 501, max: 600 },
            { min: 601, max: 700 },
            { min: 701, max: 800 },
            { min: 801, max: 900 },
            { min: 901, max: Infinity }
        ];

        const priceRangeCounts = {};

        for (const range of priceRanges) {
            const count = await Product.countDocuments({
                $and: [
                    { $expr: { $eq: [{ $month: '$dateOfSale' }, new Date(month + ' 1, 2022').getMonth() + 1] } },
                    { price: { $gte: range.min, $lte: range.max } }
                ]
            });
            priceRangeCounts[`${range.min}-${range.max === Infinity ? 'above' : range.max}`] = count;
        }

        res.json(priceRangeCounts);
    } catch (error) {
        console.error('Error generating bar chart:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// 5th API for pie chart
/*
GET
Create an API for pie chart Find unique categories and number of items from that
category for the selected month regardless of the year.
For example :
- X category : 20 (items)
- Y category : 5 (items)
- Z category : 3 (items)
*/

app.get('/pie-chart', async (req, res) => {
    try {
        const month = req.query.month;

        if (!/^(January|February|March|April|May|June|July|August|September|October|November|December)$/i.test(month)) {
            return res.status(400).json({ error: 'Invalid month parameter. Expected values: January to December' });
        }

        const pieChartData = await Product.aggregate([
            {
                $match: {
                    $expr: {
                        $eq: [{ $month: '$dateOfSale' }, new Date(month + ' 1, 2022').getMonth() + 1]
                    }
                }
            },
            {
                $group: {
                    _id: '$category',
                    itemCount: { $sum: 1 }
                }
            }
        ]);

        res.json(pieChartData.map(entry => ({ [entry._id]: entry.itemCount })));
    } catch (error) {
        console.error('Error fetching pie chart data:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});


// 6th API for the final response of the combined JSON
/*
GET
Create an API which fetches the data from all the 3 APIs mentioned above, combines
the response and sends a final response of the combined JSON
*/

app.get('/combined-data', async (req, res) => {
    try {
      const month = req.query.month;
  
      if (!/^(January|February|March|April|May|June|July|August|September|October|November|December)$/i.test(month)) {
        return res.status(400).json({ error: 'Invalid month parameter. Expected values: January to December' });
      }
  
      const transactionsURL = `http://localhost:3000/transactions?month=${month}`;
      const statisticsURL = `http://localhost:3000/statistics?month=${month}`;
      const pieChartURL = `http://localhost:3000/pie-chart?month=${month}`;
  
      const [transactionsResponse, statisticsResponse, pieChartResponse] = await Promise.all([
        axios.get(transactionsURL),
        axios.get(statisticsURL),
        axios.get(pieChartURL)
      ]);
  
      const combinedData = {
        transactions: transactionsResponse.data,
        statistics: statisticsResponse.data,
        pieChart: pieChartResponse.data
      };
  
      res.json(combinedData);
    } catch (error) {
      console.error('Error fetching combined data:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });
  


app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
