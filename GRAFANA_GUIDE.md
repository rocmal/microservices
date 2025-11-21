# 📊 Grafana Dashboard Creation Guide

## 🚀 Quick Access

**Grafana URL:** http://localhost:3000
- **Username:** `admin`
- **Password:** `admin123`

## 📋 Available Data Sources

1. **Prometheus** - Metrics from Kafka, JMX, Node Exporter
2. **TimescaleDB** - Customer revenue, orders, payments data
3. **MySQL** - Legacy database (if configured)

## 🎯 Pre-configured Dashboards

The following dashboards are automatically loaded:

1. **Customer Revenue Dashboard** (`customer-revenue.json`)
   - Total revenue statistics
   - Revenue over time
   - Top customers by revenue
   - Customer revenue details table

2. **Kafka Analytics** (`kafka-analytics.json`)
   - Order analytics
   - Payment statistics

3. **Kafka Overview** (`kafka-overview.json`)
   - Kafka cluster metrics

## 🛠️ Creating a New Dashboard (Step-by-Step)

### Method 1: Using Grafana UI (Recommended for Beginners)

1. **Access Grafana:**
   - Open http://localhost:3000
   - Login with `admin` / `admin123`

2. **Create New Dashboard:**
   - Click **"+"** icon → **"Create"** → **"Dashboard"**
   - Click **"Add visualization"**

3. **Select Data Source:**
   - Choose **"TimescaleDB"** from dropdown
   - Click **"Edit SQL"** to write custom queries

4. **Example Query (Customer Revenue):**
   ```sql
   SELECT 
     time as time,
     customer_id,
     total_revenue
   FROM customer_revenue
   WHERE $__timeFilter(time)
   ORDER BY time;
   ```

5. **Configure Visualization:**
   - Select visualization type (Time series, Stat, Table, etc.)
   - Customize colors, units, legends
   - Set panel title

6. **Save Dashboard:**
   - Click **"Save dashboard"** (top right)
   - Enter dashboard name
   - Choose folder (optional)

### Method 2: Create Dashboard JSON File (Advanced)

1. **Create JSON File:**
   - Create file in `grafana/dashboards/` folder
   - Use existing dashboards as templates

2. **Dashboard Structure:**
   ```json
   {
     "title": "My Dashboard",
     "panels": [
       {
         "id": 1,
         "type": "timeseries",
         "title": "My Panel",
         "datasource": "TimescaleDB",
         "targets": [
           {
             "rawSql": "SELECT time, value FROM table WHERE $__timeFilter(time);",
             "format": "time_series"
           }
         ]
       }
     ]
   }
   ```

3. **Restart Grafana:**
   ```bash
   docker compose restart grafana
   ```

## 📊 Common Queries for TimescaleDB

### Customer Revenue Queries

**Total Revenue Over Time:**
```sql
SELECT 
  time as time,
  SUM(total_revenue) as revenue
FROM customer_revenue
WHERE $__timeFilter(time)
GROUP BY time
ORDER BY time;
```

**Top Customers:**
```sql
SELECT 
  customer_id,
  MAX(total_revenue) as max_revenue
FROM customer_revenue
WHERE $__timeFilter(time)
GROUP BY customer_id
ORDER BY max_revenue DESC
LIMIT 20;
```

**Revenue by Customer:**
```sql
SELECT 
  time as time,
  customer_id,
  total_revenue
FROM customer_revenue
WHERE $__timeFilter(time)
  AND customer_id = '$customer_id'
ORDER BY time;
```

### Order Queries

**Orders Over Time:**
```sql
SELECT 
  order_date as time,
  COUNT(*) as order_count
FROM orders
WHERE $__timeFilter(order_date)
GROUP BY order_date
ORDER BY time;
```

**Orders by Status:**
```sql
SELECT 
  status,
  COUNT(*) as count
FROM orders
WHERE $__timeFilter(order_date)
GROUP BY status;
```

**Revenue from Orders:**
```sql
SELECT 
  order_date as time,
  SUM(total_amount) as revenue
FROM orders
WHERE $__timeFilter(order_date)
  AND status = 'completed'
GROUP BY order_date
ORDER BY time;
```

### Payment Queries

**Payment Methods Distribution:**
```sql
SELECT 
  payment_method,
  COUNT(*) as count
FROM payments
WHERE $__timeFilter(transaction_date)
GROUP BY payment_method;
```

**Payment Status:**
```sql
SELECT 
  status,
  COUNT(*) as count,
  SUM(amount) as total
FROM payments
WHERE $__timeFilter(transaction_date)
GROUP BY status;
```

## 🎨 Visualization Types

### Time Series
- **Best for:** Revenue over time, order trends
- **Query format:** `format: "time_series"`
- **Requires:** `time` column + value column

### Stat
- **Best for:** Total counts, averages, single metrics
- **Query format:** `format: "table"`
- **Shows:** Single value with optional sparkline

### Bar Chart
- **Best for:** Comparisons, top N lists
- **Query format:** `format: "table"`
- **Requires:** metric column + value column

### Table
- **Best for:** Detailed data, customer lists
- **Query format:** `format: "table"`
- **Shows:** Full data table with sorting

### Pie Chart
- **Best for:** Distribution, percentages
- **Query format:** `format: "table"`
- **Requires:** metric column + value column

## 🔧 Dashboard Variables (Templating)

Add dropdown filters to dashboards:

```json
{
  "templating": {
    "list": [
      {
        "name": "customer_id",
        "type": "query",
        "label": "Customer",
        "datasource": "TimescaleDB",
        "query": "SELECT DISTINCT customer_id FROM customer_revenue;",
        "includeAll": true,
        "multi": true
      }
    ]
  }
}
```

Use in queries:
```sql
WHERE customer_id = '$customer_id'
```

## 📈 Time Range Variables

Grafana provides built-in time variables:
- `$__timeFilter(time_column)` - Filters by dashboard time range
- `$__timeFrom()` - Start time
- `$__timeTo()` - End time
- `$__interval` - Auto-calculated interval

## 🎯 Best Practices

1. **Use Time Filters:**
   Always include `$__timeFilter(time_column)` in queries

2. **Optimize Queries:**
   - Use indexes (customer_id, time columns)
   - Limit results when possible
   - Use aggregations for large datasets

3. **Panel Organization:**
   - Group related panels
   - Use consistent colors
   - Add descriptions

4. **Refresh Rates:**
   - Real-time: 5s-30s
   - Historical: 1m-5m
   - Static: Manual refresh

5. **Units:**
   - Revenue: `currencyUSD`
   - Counts: `short` or `none`
   - Percentages: `percent`
   - Time: `s`, `m`, `h`

## 🔍 Troubleshooting

### Dashboard Not Loading
- Check JSON syntax (use JSON validator)
- Verify datasource name matches
- Check Grafana logs: `docker logs grafana`

### No Data Showing
- Verify query syntax
- Check time range
- Test query in TimescaleDB directly
- Verify datasource connection

### Slow Queries
- Add indexes on filtered columns
- Use time_bucket for aggregations
- Limit result sets
- Use materialized views for complex queries

## 📚 Resources

- **Grafana Docs:** https://grafana.com/docs/
- **PostgreSQL/TimescaleDB Plugin:** https://grafana.com/grafana/plugins/grafana-postgresql-datasource/
- **Dashboard JSON Schema:** https://grafana.com/docs/grafana/latest/dashboards/json-model/

## 🚀 Quick Start Example

1. Open Grafana: http://localhost:3000
2. Go to **Dashboards** → **Customer Revenue Dashboard**
3. Explore the pre-configured panels
4. Click **"Edit"** to see how queries are structured
5. Create your own panel using the examples above

---

**Need Help?** Check the existing dashboard JSON files in `grafana/dashboards/` for reference!

