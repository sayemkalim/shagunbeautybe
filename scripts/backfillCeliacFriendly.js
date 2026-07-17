require('dotenv').config()
const mongoose = require('mongoose')

const Product = require('../models/productsModel')

async function backfill() {
  await mongoose.connect(process.env.MONGO_URI)
  console.log('Connected to MongoDB')

  const result = await Product.updateMany(
    { category: 'Gluten Free' },
    { $set: { celiacFriendly: true } }
  )

  console.log(`Updated ${result.modifiedCount} products with celiacFriendly: true`)
  await mongoose.disconnect()
  console.log('Done.')
}

backfill().catch(console.error)
