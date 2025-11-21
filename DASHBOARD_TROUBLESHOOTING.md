# 🔧 Dashboard Troubleshooting Guide

## Issue: Dashboards Showing No Data

### Step 1: Verify Data Exists
```bash
docker exec -i timescaledb psql -U admin -d analytics -c "SELECT COUNT(*) FROM customer_revenue;"
```

### Step 2: Check Datasource Connection

1. **Access Grafana:** http://localhost:3000
2. **Go to:** Configuration → Data Sources
3. **Click:** "TimescaleDB" datasource
4. **Click:** "Test" button at the bottom
5. **Verify:** Connection successful

### Step 3: Manual Query Test

1. **In Grafana:** Go to Explore (compass icon)
2. **Select:** TimescaleDB datasource
3. **Run this test query:**
```sql
SELECT COUNT(*) as value FROM customer_revenue;
```

If this works, the datasource is connected correctly.

### Step 4: Check Time Range

The dashboard uses `$__timeFrom()` and `$__timeTo()` which depend on the dashboard time range.

**Fix:** In the dashboard, set time range to:
- **From:** `2025-05-14` (or `now-6M`)
- **To:** `now`

### Step 5: Verify Dashboard Queries

Open the dashboard in edit mode and check each panel:
1. Click on a panel → Edit
2. Check the query in the "Query" tab
3. Click "Run query" to test

### Step 6: Alternative Simple Queries

If time filters aren't working, try these simpler queries:

**Simple Count:**
```sql
SELECT COUNT(*) as value FROM customer_revenue;
```

**Without Time Filter:**
```sql
SELECT time, total_revenue 
FROM customer_revenue 
ORDER BY time DESC 
LIMIT 100;
```

### Step 7: Check Datasource Configuration

Verify the datasource YAML file:
- File: `grafana/provisioning/datasources/prometheus.yml`
- Should have TimescaleDB entry with:
  - `url: timescaledb:5432`
  - `database: analytics`
  - `user: admin`
  - `password: admin123`

### Step 8: Restart Services

```bash
docker compose restart grafana
```

Wait 30 seconds for Grafana to reload dashboards.

### Step 9: Check Grafana Logs

```bash
docker logs grafana --tail 50
```

Look for errors related to:
- Datasource connection
- Query execution
- Dashboard loading

### Step 10: Create New Dashboard Manually

1. In Grafana: **"+"** → **"Create"** → **"Dashboard"**
2. **"Add visualization"**
3. Select **"TimescaleDB"** datasource
4. Switch to **"Code"** mode
5. Paste this query:
```sql
SELECT COUNT(*) as value FROM customer_revenue;
```
6. Click **"Run query"**
7. If data appears, the datasource works!

## Common Issues & Solutions

### Issue: "Datasource not found"
**Solution:** Check datasource name matches exactly: `TimescaleDB`

### Issue: "Connection refused"
**Solution:** 
- Verify TimescaleDB container is running: `docker ps | grep timescaledb`
- Check network: Both containers should be on `monitoring` network

### Issue: "Authentication failed"
**Solution:**
- Verify password in datasource config: `admin123`
- Test connection: `docker exec -i timescaledb psql -U admin -d analytics -c "SELECT 1;"`

### Issue: "Table does not exist"
**Solution:**
- Verify table name: `customer_revenue` (not `customer_revenues`)
- Check database: Should be `analytics`

### Issue: "Time filter not working"
**Solution:**
- Use explicit time conversion: `time >= $__timeFrom()::timestamptz`
- Or use: `WHERE time >= '2025-05-14'::timestamptz`

## Quick Test Queries

**Test 1: Simple Count**
```sql
SELECT COUNT(*) FROM customer_revenue;
```

**Test 2: Sample Data**
```sql
SELECT * FROM customer_revenue LIMIT 10;
```

**Test 3: Time Range**
```sql
SELECT MIN(time) as earliest, MAX(time) as latest 
FROM customer_revenue;
```

**Test 4: Revenue Aggregation**
```sql
SELECT 
  DATE_TRUNC('day', time) as day,
  SUM(total_revenue) as daily_revenue
FROM customer_revenue
GROUP BY day
ORDER BY day DESC
LIMIT 30;
```

## Manual Dashboard Creation Steps

1. **Open Grafana:** http://localhost:3000
2. **Login:** admin / admin123
3. **Create Dashboard:** "+" → "Create" → "Dashboard"
4. **Add Panel:** Click "Add visualization"
5. **Select Datasource:** Choose "TimescaleDB"
6. **Write Query:**
   - Click "Code" button (top right of query editor)
   - Paste SQL query
   - Click "Run query"
7. **Configure Visualization:**
   - Select panel type (Stat, Time series, Table, etc.)
   - Customize colors, units, etc.
8. **Save:** Click "Save dashboard"

## Still Not Working?

1. **Check container logs:**
   ```bash
   docker logs grafana
   docker logs timescaledb
   ```

2. **Verify network:**
   ```bash
   docker network inspect microservices_monitoring
   ```

3. **Test direct connection:**
   ```bash
   docker exec -i grafana ping -c 2 timescaledb
   ```

4. **Recreate datasource manually in UI:**
   - Configuration → Data Sources → Add data source
   - Select PostgreSQL
   - Host: `timescaledb:5432`
   - Database: `analytics`
   - User: `admin`
   - Password: `admin123`
   - SSL Mode: `disable`
   - Click "Save & Test"

