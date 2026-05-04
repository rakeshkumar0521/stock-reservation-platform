#!/usr/bin/env python3
"""
Backend API Tests for Inventory Reservation System
Tests all backend endpoints with focus on concurrency, idempotency, and edge cases
"""

import requests
import time
import uuid
from datetime import datetime, timedelta

# Base URL from environment
BASE_URL = "https://reserve-flow-8.preview.emergentagent.com/api"

# Test results tracking
test_results = {
    "passed": [],
    "failed": [],
    "warnings": []
}

def log_test(test_name, passed, message=""):
    """Log test result"""
    if passed:
        test_results["passed"].append(test_name)
        print(f"✅ PASS: {test_name}")
        if message:
            print(f"   {message}")
    else:
        test_results["failed"].append(test_name)
        print(f"❌ FAIL: {test_name}")
        if message:
            print(f"   {message}")

def log_warning(test_name, message):
    """Log warning (minor issue)"""
    test_results["warnings"].append(test_name)
    print(f"⚠️  WARNING: {test_name}")
    print(f"   {message}")

def print_summary():
    """Print test summary"""
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    print(f"✅ Passed: {len(test_results['passed'])}")
    print(f"❌ Failed: {len(test_results['failed'])}")
    print(f"⚠️  Warnings: {len(test_results['warnings'])}")
    
    if test_results['failed']:
        print("\nFailed Tests:")
        for test in test_results['failed']:
            print(f"  - {test}")
    
    if test_results['warnings']:
        print("\nWarnings (Minor Issues):")
        for test in test_results['warnings']:
            print(f"  - {test}")
    
    print("="*80)

# ============================================================================
# TEST 1: Health Check
# ============================================================================
def test_health_check():
    """Test GET /api/health"""
    print("\n" + "="*80)
    print("TEST 1: Health Check")
    print("="*80)
    
    try:
        response = requests.get(f"{BASE_URL}/health", timeout=20)
        
        if response.status_code == 200:
            data = response.json()
            if data.get("status") == "ok" and data.get("database"):
                log_test("GET /api/health", True, f"Response: {data}")
            else:
                log_test("GET /api/health", False, f"Unexpected response: {data}")
        else:
            log_test("GET /api/health", False, f"Status code: {response.status_code}, Response: {response.text}")
    except Exception as e:
        log_test("GET /api/health", False, f"Exception: {str(e)}")

# ============================================================================
# TEST 2: Seed Database
# ============================================================================
def test_seed_database():
    """Test POST /api/seed - Reset and reseed database"""
    print("\n" + "="*80)
    print("TEST 2: Seed Database")
    print("="*80)
    
    try:
        response = requests.post(f"{BASE_URL}/seed", timeout=20)
        
        if response.status_code == 200:
            data = response.json()
            log_test("POST /api/seed", True, f"Response: {data}")
            return True
        else:
            log_test("POST /api/seed", False, f"Status code: {response.status_code}, Response: {response.text}")
            return False
    except Exception as e:
        log_test("POST /api/seed", False, f"Exception: {str(e)}")
        return False

# ============================================================================
# TEST 3: Get Products
# ============================================================================
def test_get_products():
    """Test GET /api/products"""
    print("\n" + "="*80)
    print("TEST 3: Get Products")
    print("="*80)
    
    try:
        response = requests.get(f"{BASE_URL}/products", timeout=20)
        
        if response.status_code == 200:
            data = response.json()
            if isinstance(data, list) and len(data) > 0:
                # Check structure
                product = data[0]
                required_fields = ['id', 'name', 'price', 'inventory', 'totalAvailable']
                missing_fields = [f for f in required_fields if f not in product]
                
                if missing_fields:
                    log_test("GET /api/products", False, f"Missing fields: {missing_fields}")
                    return None
                
                # Check inventory structure
                if len(product['inventory']) > 0:
                    inv = product['inventory'][0]
                    inv_fields = ['warehouseId', 'warehouseName', 'totalStock', 'reservedStock', 'availableStock']
                    missing_inv_fields = [f for f in inv_fields if f not in inv]
                    
                    if missing_inv_fields:
                        log_test("GET /api/products", False, f"Missing inventory fields: {missing_inv_fields}")
                        return None
                    
                    # Verify availableStock = totalStock - reservedStock
                    if inv['availableStock'] != inv['totalStock'] - inv['reservedStock']:
                        log_test("GET /api/products", False, 
                                f"availableStock calculation incorrect: {inv['availableStock']} != {inv['totalStock']} - {inv['reservedStock']}")
                        return None
                
                log_test("GET /api/products", True, f"Found {len(data)} products")
                return data
            else:
                log_test("GET /api/products", False, f"Expected list of products, got: {data}")
                return None
        else:
            log_test("GET /api/products", False, f"Status code: {response.status_code}, Response: {response.text}")
            return None
    except Exception as e:
        log_test("GET /api/products", False, f"Exception: {str(e)}")
        return None

# ============================================================================
# TEST 4: Get Warehouses
# ============================================================================
def test_get_warehouses():
    """Test GET /api/warehouses"""
    print("\n" + "="*80)
    print("TEST 4: Get Warehouses")
    print("="*80)
    
    try:
        response = requests.get(f"{BASE_URL}/warehouses", timeout=20)
        
        if response.status_code == 200:
            data = response.json()
            if isinstance(data, list) and len(data) > 0:
                warehouse = data[0]
                required_fields = ['id', 'name', 'location']
                missing_fields = [f for f in required_fields if f not in warehouse]
                
                if missing_fields:
                    log_test("GET /api/warehouses", False, f"Missing fields: {missing_fields}")
                    return None
                
                log_test("GET /api/warehouses", True, f"Found {len(data)} warehouses")
                return data
            else:
                log_test("GET /api/warehouses", False, f"Expected list of warehouses, got: {data}")
                return None
        else:
            log_test("GET /api/warehouses", False, f"Status code: {response.status_code}, Response: {response.text}")
            return None
    except Exception as e:
        log_test("GET /api/warehouses", False, f"Exception: {str(e)}")
        return None

# ============================================================================
# TEST 5: Create Reservation - Success
# ============================================================================
def test_create_reservation_success(products):
    """Test POST /api/reservations - Success case"""
    print("\n" + "="*80)
    print("TEST 5: Create Reservation - Success")
    print("="*80)
    
    try:
        # Find a product with available stock
        product = None
        warehouse_id = None
        for p in products:
            for inv in p['inventory']:
                if inv['availableStock'] > 0:
                    product = p
                    warehouse_id = inv['warehouseId']
                    break
            if product:
                break
        
        if not product:
            log_test("POST /api/reservations (success)", False, "No products with available stock")
            return None
        
        payload = {
            "productId": product['id'],
            "warehouseId": warehouse_id,
            "quantity": 1
        }
        
        response = requests.post(f"{BASE_URL}/reservations", json=payload, timeout=20)
        
        if response.status_code == 201:
            data = response.json()
            required_fields = ['id', 'productId', 'warehouseId', 'quantity', 'status', 'expiresAt', 'createdAt']
            missing_fields = [f for f in required_fields if f not in data]
            
            if missing_fields:
                log_test("POST /api/reservations (success)", False, f"Missing fields: {missing_fields}")
                return None
            
            if data['status'] != 'pending':
                log_test("POST /api/reservations (success)", False, f"Expected status 'pending', got: {data['status']}")
                return None
            
            log_test("POST /api/reservations (success)", True, f"Created reservation: {data['id']}")
            return data
        else:
            log_test("POST /api/reservations (success)", False, 
                    f"Status code: {response.status_code}, Response: {response.text}")
            return None
    except Exception as e:
        log_test("POST /api/reservations (success)", False, f"Exception: {str(e)}")
        return None

# ============================================================================
# TEST 6: Create Reservation - Edge Cases
# ============================================================================
def test_create_reservation_edge_cases(products):
    """Test POST /api/reservations - Edge cases"""
    print("\n" + "="*80)
    print("TEST 6: Create Reservation - Edge Cases")
    print("="*80)
    
    if not products or len(products) == 0:
        log_test("POST /api/reservations (edge cases)", False, "No products available")
        return
    
    product = products[0]
    warehouse_id = product['inventory'][0]['warehouseId'] if product['inventory'] else None
    
    # Test 6.1: Missing fields
    try:
        response = requests.post(f"{BASE_URL}/reservations", json={}, timeout=10)
        if response.status_code == 400:
            log_test("POST /api/reservations (missing fields)", True, "Correctly rejected missing fields")
        else:
            log_warning("POST /api/reservations (missing fields)", 
                       f"Expected 400, got {response.status_code}")
    except Exception as e:
        log_test("POST /api/reservations (missing fields)", False, f"Exception: {str(e)}")
    
    # Test 6.2: Quantity 0
    try:
        payload = {"productId": product['id'], "warehouseId": warehouse_id, "quantity": 0}
        response = requests.post(f"{BASE_URL}/reservations", json=payload, timeout=20)
        if response.status_code == 400:
            log_test("POST /api/reservations (quantity 0)", True, "Correctly rejected quantity 0")
        else:
            log_warning("POST /api/reservations (quantity 0)", 
                       f"Expected 400, got {response.status_code}")
    except Exception as e:
        log_test("POST /api/reservations (quantity 0)", False, f"Exception: {str(e)}")
    
    # Test 6.3: Negative quantity
    try:
        payload = {"productId": product['id'], "warehouseId": warehouse_id, "quantity": -1}
        response = requests.post(f"{BASE_URL}/reservations", json=payload, timeout=20)
        if response.status_code == 400:
            log_test("POST /api/reservations (negative quantity)", True, "Correctly rejected negative quantity")
        else:
            log_warning("POST /api/reservations (negative quantity)", 
                       f"Expected 400, got {response.status_code}")
    except Exception as e:
        log_test("POST /api/reservations (negative quantity)", False, f"Exception: {str(e)}")
    
    # Test 6.4: Invalid product/warehouse combo
    try:
        payload = {"productId": "invalid-id", "warehouseId": "invalid-id", "quantity": 1}
        response = requests.post(f"{BASE_URL}/reservations", json=payload, timeout=20)
        if response.status_code == 404:
            log_test("POST /api/reservations (invalid IDs)", True, "Correctly returned 404 for invalid IDs")
        else:
            log_warning("POST /api/reservations (invalid IDs)", 
                       f"Expected 404, got {response.status_code}")
    except Exception as e:
        log_test("POST /api/reservations (invalid IDs)", False, f"Exception: {str(e)}")

# ============================================================================
# TEST 7: Concurrency - Reserve All Stock
# ============================================================================
def test_concurrency_reserve_all_stock(products):
    """Test concurrency: Reserve all stock, then try to reserve more"""
    print("\n" + "="*80)
    print("TEST 7: Concurrency - Reserve All Stock")
    print("="*80)
    
    try:
        # Find a product with low stock (Nintendo Switch has 1, 2, 1 stock)
        product = None
        warehouse_id = None
        available_stock = 0
        
        for p in products:
            for inv in p['inventory']:
                if inv['availableStock'] > 0 and inv['availableStock'] <= 2:
                    product = p
                    warehouse_id = inv['warehouseId']
                    available_stock = inv['availableStock']
                    break
            if product:
                break
        
        if not product:
            log_test("Concurrency test", False, "No products with low stock found")
            return
        
        print(f"Testing with product: {product['name']}, warehouse: {warehouse_id}, available: {available_stock}")
        
        # Reserve all available stock
        payload = {
            "productId": product['id'],
            "warehouseId": warehouse_id,
            "quantity": available_stock
        }
        
        response1 = requests.post(f"{BASE_URL}/reservations", json=payload, timeout=10)
        
        if response1.status_code != 201:
            log_test("Concurrency test (reserve all)", False, 
                    f"Failed to reserve stock: {response1.status_code}, {response1.text}")
            return
        
        reservation1 = response1.json()
        print(f"Reserved all {available_stock} units: {reservation1['id']}")
        
        # Try to reserve more (should fail with 409)
        payload2 = {
            "productId": product['id'],
            "warehouseId": warehouse_id,
            "quantity": 1
        }
        
        response2 = requests.post(f"{BASE_URL}/reservations", json=payload2, timeout=10)
        
        if response2.status_code == 409:
            data = response2.json()
            log_test("Concurrency test (409 on insufficient stock)", True, 
                    f"Correctly returned 409: {data.get('error')}")
        else:
            log_test("Concurrency test (409 on insufficient stock)", False, 
                    f"Expected 409, got {response2.status_code}: {response2.text}")
        
        # Cleanup: release the reservation
        requests.post(f"{BASE_URL}/reservations/{reservation1['id']}/release", timeout=20)
        
    except Exception as e:
        log_test("Concurrency test", False, f"Exception: {str(e)}")

# ============================================================================
# TEST 8: Confirm Reservation Flow
# ============================================================================
def test_confirm_reservation_flow(products):
    """Test confirm flow: Reserve -> Check stock -> Confirm -> Check stock decreased"""
    print("\n" + "="*80)
    print("TEST 8: Confirm Reservation Flow")
    print("="*80)
    
    try:
        # Find a product with available stock
        product = None
        warehouse_id = None
        for p in products:
            for inv in p['inventory']:
                if inv['availableStock'] > 0:
                    product = p
                    warehouse_id = inv['warehouseId']
                    break
            if product:
                break
        
        if not product:
            log_test("Confirm flow", False, "No products with available stock")
            return
        
        # Get initial stock
        response = requests.get(f"{BASE_URL}/products", timeout=20)
        products_before = response.json()
        product_before = next(p for p in products_before if p['id'] == product['id'])
        inv_before = next(inv for inv in product_before['inventory'] if inv['warehouseId'] == warehouse_id)
        
        print(f"Before reservation - Total: {inv_before['totalStock']}, Reserved: {inv_before['reservedStock']}, Available: {inv_before['availableStock']}")
        
        # Create reservation
        payload = {"productId": product['id'], "warehouseId": warehouse_id, "quantity": 1}
        response = requests.post(f"{BASE_URL}/reservations", json=payload, timeout=20)
        
        if response.status_code != 201:
            log_test("Confirm flow (create)", False, f"Failed to create reservation: {response.text}")
            return
        
        reservation = response.json()
        print(f"Created reservation: {reservation['id']}")
        
        # Check stock after reservation (reservedStock should increase)
        response = requests.get(f"{BASE_URL}/products", timeout=20)
        products_after_reserve = response.json()
        product_after_reserve = next(p for p in products_after_reserve if p['id'] == product['id'])
        inv_after_reserve = next(inv for inv in product_after_reserve['inventory'] if inv['warehouseId'] == warehouse_id)
        
        print(f"After reservation - Total: {inv_after_reserve['totalStock']}, Reserved: {inv_after_reserve['reservedStock']}, Available: {inv_after_reserve['availableStock']}")
        
        if inv_after_reserve['reservedStock'] != inv_before['reservedStock'] + 1:
            log_test("Confirm flow (stock after reserve)", False, 
                    f"reservedStock should increase by 1: {inv_before['reservedStock']} -> {inv_after_reserve['reservedStock']}")
            return
        
        if inv_after_reserve['availableStock'] != inv_before['availableStock'] - 1:
            log_test("Confirm flow (stock after reserve)", False, 
                    f"availableStock should decrease by 1: {inv_before['availableStock']} -> {inv_after_reserve['availableStock']}")
            return
        
        log_test("Confirm flow (stock after reserve)", True, "Stock correctly updated after reservation")
        
        # Confirm reservation
        response = requests.post(f"{BASE_URL}/reservations/{reservation['id']}/confirm", timeout=20)
        
        if response.status_code != 200:
            log_test("Confirm flow (confirm)", False, f"Failed to confirm: {response.status_code}, {response.text}")
            return
        
        confirm_data = response.json()
        print(f"Confirmed reservation: {confirm_data}")
        
        # Check stock after confirm (totalStock and reservedStock should both decrease)
        response = requests.get(f"{BASE_URL}/products", timeout=20)
        products_after_confirm = response.json()
        product_after_confirm = next(p for p in products_after_confirm if p['id'] == product['id'])
        inv_after_confirm = next(inv for inv in product_after_confirm['inventory'] if inv['warehouseId'] == warehouse_id)
        
        print(f"After confirm - Total: {inv_after_confirm['totalStock']}, Reserved: {inv_after_confirm['reservedStock']}, Available: {inv_after_confirm['availableStock']}")
        
        if inv_after_confirm['totalStock'] != inv_before['totalStock'] - 1:
            log_test("Confirm flow (stock after confirm)", False, 
                    f"totalStock should decrease by 1: {inv_before['totalStock']} -> {inv_after_confirm['totalStock']}")
            return
        
        if inv_after_confirm['reservedStock'] != inv_before['reservedStock']:
            log_test("Confirm flow (stock after confirm)", False, 
                    f"reservedStock should return to original: {inv_before['reservedStock']} != {inv_after_confirm['reservedStock']}")
            return
        
        log_test("Confirm flow (complete)", True, "Confirm flow works correctly - stock permanently deducted")
        
    except Exception as e:
        log_test("Confirm flow", False, f"Exception: {str(e)}")

# ============================================================================
# TEST 9: Release Reservation Flow
# ============================================================================
def test_release_reservation_flow(products):
    """Test release flow: Reserve -> Check stock -> Release -> Check stock restored"""
    print("\n" + "="*80)
    print("TEST 9: Release Reservation Flow")
    print("="*80)
    
    try:
        # Find a product with available stock
        product = None
        warehouse_id = None
        for p in products:
            for inv in p['inventory']:
                if inv['availableStock'] > 0:
                    product = p
                    warehouse_id = inv['warehouseId']
                    break
            if product:
                break
        
        if not product:
            log_test("Release flow", False, "No products with available stock")
            return
        
        # Get initial stock
        response = requests.get(f"{BASE_URL}/products", timeout=20)
        products_before = response.json()
        product_before = next(p for p in products_before if p['id'] == product['id'])
        inv_before = next(inv for inv in product_before['inventory'] if inv['warehouseId'] == warehouse_id)
        
        print(f"Before reservation - Total: {inv_before['totalStock']}, Reserved: {inv_before['reservedStock']}, Available: {inv_before['availableStock']}")
        
        # Create reservation
        payload = {"productId": product['id'], "warehouseId": warehouse_id, "quantity": 1}
        response = requests.post(f"{BASE_URL}/reservations", json=payload, timeout=20)
        
        if response.status_code != 201:
            log_test("Release flow (create)", False, f"Failed to create reservation: {response.text}")
            return
        
        reservation = response.json()
        print(f"Created reservation: {reservation['id']}")
        
        # Check stock after reservation
        response = requests.get(f"{BASE_URL}/products", timeout=20)
        products_after_reserve = response.json()
        product_after_reserve = next(p for p in products_after_reserve if p['id'] == product['id'])
        inv_after_reserve = next(inv for inv in product_after_reserve['inventory'] if inv['warehouseId'] == warehouse_id)
        
        print(f"After reservation - Total: {inv_after_reserve['totalStock']}, Reserved: {inv_after_reserve['reservedStock']}, Available: {inv_after_reserve['availableStock']}")
        
        # Release reservation
        response = requests.post(f"{BASE_URL}/reservations/{reservation['id']}/release", timeout=10)
        
        if response.status_code != 200:
            log_test("Release flow (release)", False, f"Failed to release: {response.status_code}, {response.text}")
            return
        
        release_data = response.json()
        print(f"Released reservation: {release_data}")
        
        # Check stock after release (should return to original)
        response = requests.get(f"{BASE_URL}/products", timeout=20)
        products_after_release = response.json()
        product_after_release = next(p for p in products_after_release if p['id'] == product['id'])
        inv_after_release = next(inv for inv in product_after_release['inventory'] if inv['warehouseId'] == warehouse_id)
        
        print(f"After release - Total: {inv_after_release['totalStock']}, Reserved: {inv_after_release['reservedStock']}, Available: {inv_after_release['availableStock']}")
        
        if inv_after_release['totalStock'] != inv_before['totalStock']:
            log_test("Release flow (stock after release)", False, 
                    f"totalStock should remain same: {inv_before['totalStock']} != {inv_after_release['totalStock']}")
            return
        
        if inv_after_release['reservedStock'] != inv_before['reservedStock']:
            log_test("Release flow (stock after release)", False, 
                    f"reservedStock should return to original: {inv_before['reservedStock']} != {inv_after_release['reservedStock']}")
            return
        
        if inv_after_release['availableStock'] != inv_before['availableStock']:
            log_test("Release flow (stock after release)", False, 
                    f"availableStock should return to original: {inv_before['availableStock']} != {inv_after_release['availableStock']}")
            return
        
        log_test("Release flow (complete)", True, "Release flow works correctly - stock restored")
        
    except Exception as e:
        log_test("Release flow", False, f"Exception: {str(e)}")

# ============================================================================
# TEST 10: Idempotency
# ============================================================================
def test_idempotency(products):
    """Test idempotency: Same Idempotency-Key returns existing reservation"""
    print("\n" + "="*80)
    print("TEST 10: Idempotency")
    print("="*80)
    
    try:
        # Find a product with available stock
        product = None
        warehouse_id = None
        for p in products:
            for inv in p['inventory']:
                if inv['availableStock'] > 1:  # Need at least 2 to test
                    product = p
                    warehouse_id = inv['warehouseId']
                    break
            if product:
                break
        
        if not product:
            log_test("Idempotency test", False, "No products with sufficient stock")
            return
        
        idempotency_key = str(uuid.uuid4())
        payload = {"productId": product['id'], "warehouseId": warehouse_id, "quantity": 1}
        headers = {"Idempotency-Key": idempotency_key}
        
        # First request
        response1 = requests.post(f"{BASE_URL}/reservations", json=payload, headers=headers, timeout=10)
        
        if response1.status_code != 201:
            log_test("Idempotency test (first request)", False, 
                    f"Failed to create reservation: {response1.status_code}, {response1.text}")
            return
        
        reservation1 = response1.json()
        print(f"First request - Created reservation: {reservation1['id']}")
        
        # Second request with same key
        response2 = requests.post(f"{BASE_URL}/reservations", json=payload, headers=headers, timeout=10)
        
        if response2.status_code == 200:
            reservation2 = response2.json()
            
            if reservation2.get('duplicate') == True and reservation2.get('id') == reservation1['id']:
                log_test("Idempotency test", True, 
                        f"Correctly returned existing reservation with duplicate=true")
            else:
                log_test("Idempotency test", False, 
                        f"Expected duplicate=true and same ID, got: {reservation2}")
        else:
            log_test("Idempotency test", False, 
                    f"Expected 200, got {response2.status_code}: {response2.text}")
        
        # Cleanup
        requests.post(f"{BASE_URL}/reservations/{reservation1['id']}/release", timeout=20)
        
    except Exception as e:
        log_test("Idempotency test", False, f"Exception: {str(e)}")

# ============================================================================
# TEST 11: Confirm Already Confirmed
# ============================================================================
def test_confirm_already_confirmed(products):
    """Test confirming an already confirmed reservation (should return 400)"""
    print("\n" + "="*80)
    print("TEST 11: Confirm Already Confirmed")
    print("="*80)
    
    try:
        # Find a product with available stock
        product = None
        warehouse_id = None
        for p in products:
            for inv in p['inventory']:
                if inv['availableStock'] > 0:
                    product = p
                    warehouse_id = inv['warehouseId']
                    break
            if product:
                break
        
        if not product:
            log_test("Confirm already confirmed", False, "No products with available stock")
            return
        
        # Create and confirm reservation
        payload = {"productId": product['id'], "warehouseId": warehouse_id, "quantity": 1}
        response = requests.post(f"{BASE_URL}/reservations", json=payload, timeout=20)
        
        if response.status_code != 201:
            log_test("Confirm already confirmed (create)", False, f"Failed to create: {response.text}")
            return
        
        reservation = response.json()
        
        # Confirm first time
        response = requests.post(f"{BASE_URL}/reservations/{reservation['id']}/confirm", timeout=20)
        
        if response.status_code != 200:
            log_test("Confirm already confirmed (first confirm)", False, f"Failed to confirm: {response.text}")
            return
        
        # Try to confirm again
        response = requests.post(f"{BASE_URL}/reservations/{reservation['id']}/confirm", timeout=20)
        
        if response.status_code == 400:
            data = response.json()
            log_test("Confirm already confirmed", True, f"Correctly returned 400: {data.get('error')}")
        else:
            log_warning("Confirm already confirmed", 
                       f"Expected 400, got {response.status_code}: {response.text}")
        
    except Exception as e:
        log_test("Confirm already confirmed", False, f"Exception: {str(e)}")

# ============================================================================
# TEST 12: Release Already Released
# ============================================================================
def test_release_already_released(products):
    """Test releasing an already released reservation (should return 400)"""
    print("\n" + "="*80)
    print("TEST 12: Release Already Released")
    print("="*80)
    
    try:
        # Find a product with available stock
        product = None
        warehouse_id = None
        for p in products:
            for inv in p['inventory']:
                if inv['availableStock'] > 0:
                    product = p
                    warehouse_id = inv['warehouseId']
                    break
            if product:
                break
        
        if not product:
            log_test("Release already released", False, "No products with available stock")
            return
        
        # Create and release reservation
        payload = {"productId": product['id'], "warehouseId": warehouse_id, "quantity": 1}
        response = requests.post(f"{BASE_URL}/reservations", json=payload, timeout=20)
        
        if response.status_code != 201:
            log_test("Release already released (create)", False, f"Failed to create: {response.text}")
            return
        
        reservation = response.json()
        
        # Release first time
        response = requests.post(f"{BASE_URL}/reservations/{reservation['id']}/release", timeout=10)
        
        if response.status_code != 200:
            log_test("Release already released (first release)", False, f"Failed to release: {response.text}")
            return
        
        # Try to release again
        response = requests.post(f"{BASE_URL}/reservations/{reservation['id']}/release", timeout=10)
        
        if response.status_code == 400:
            data = response.json()
            log_test("Release already released", True, f"Correctly returned 400: {data.get('error')}")
        else:
            log_warning("Release already released", 
                       f"Expected 400, got {response.status_code}: {response.text}")
        
    except Exception as e:
        log_test("Release already released", False, f"Exception: {str(e)}")

# ============================================================================
# TEST 13: Get Reservations
# ============================================================================
def test_get_reservations():
    """Test GET /api/reservations"""
    print("\n" + "="*80)
    print("TEST 13: Get Reservations")
    print("="*80)
    
    try:
        response = requests.get(f"{BASE_URL}/reservations", timeout=20)
        
        if response.status_code == 200:
            data = response.json()
            if isinstance(data, list):
                log_test("GET /api/reservations", True, f"Found {len(data)} reservations")
                
                if len(data) > 0:
                    # Check structure
                    reservation = data[0]
                    required_fields = ['id', 'productId', 'productName', 'warehouseId', 'warehouseName', 
                                     'quantity', 'status', 'expiresAt', 'createdAt']
                    missing_fields = [f for f in required_fields if f not in reservation]
                    
                    if missing_fields:
                        log_warning("GET /api/reservations (structure)", 
                                   f"Missing fields in reservation: {missing_fields}")
            else:
                log_test("GET /api/reservations", False, f"Expected list, got: {type(data)}")
        else:
            log_test("GET /api/reservations", False, 
                    f"Status code: {response.status_code}, Response: {response.text}")
    except Exception as e:
        log_test("GET /api/reservations", False, f"Exception: {str(e)}")

# ============================================================================
# TEST 14: Invalid Reservation ID
# ============================================================================
def test_invalid_reservation_id():
    """Test confirm/release with invalid reservation ID"""
    print("\n" + "="*80)
    print("TEST 14: Invalid Reservation ID")
    print("="*80)
    
    invalid_id = "invalid-reservation-id"
    
    # Test confirm with invalid ID
    try:
        response = requests.post(f"{BASE_URL}/reservations/{invalid_id}/confirm", timeout=20)
        if response.status_code == 404:
            log_test("Confirm invalid ID", True, "Correctly returned 404")
        else:
            log_warning("Confirm invalid ID", f"Expected 404, got {response.status_code}")
    except Exception as e:
        log_test("Confirm invalid ID", False, f"Exception: {str(e)}")
    
    # Test release with invalid ID
    try:
        response = requests.post(f"{BASE_URL}/reservations/{invalid_id}/release", timeout=20)
        if response.status_code == 404:
            log_test("Release invalid ID", True, "Correctly returned 404")
        else:
            log_warning("Release invalid ID", f"Expected 404, got {response.status_code}")
    except Exception as e:
        log_test("Release invalid ID", False, f"Exception: {str(e)}")

# ============================================================================
# MAIN TEST RUNNER
# ============================================================================
def main():
    """Run all tests"""
    print("\n" + "="*80)
    print("INVENTORY RESERVATION SYSTEM - BACKEND API TESTS")
    print("="*80)
    print(f"Base URL: {BASE_URL}")
    print(f"Started at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    
    # Test 1: Health check
    test_health_check()
    
    # Test 2: Seed database
    if not test_seed_database():
        print("\n❌ CRITICAL: Failed to seed database. Stopping tests.")
        print_summary()
        return
    
    # Test 3: Get products
    products = test_get_products()
    if not products:
        print("\n❌ CRITICAL: Failed to get products. Stopping tests.")
        print_summary()
        return
    
    # Test 4: Get warehouses
    warehouses = test_get_warehouses()
    if not warehouses:
        print("\n❌ CRITICAL: Failed to get warehouses. Stopping tests.")
        print_summary()
        return
    
    # Test 5: Create reservation - success
    test_create_reservation_success(products)
    
    # Test 6: Create reservation - edge cases
    test_create_reservation_edge_cases(products)
    
    # Test 7: Concurrency
    test_concurrency_reserve_all_stock(products)
    
    # Test 8: Confirm flow
    test_confirm_reservation_flow(products)
    
    # Test 9: Release flow
    test_release_reservation_flow(products)
    
    # Test 10: Idempotency
    test_idempotency(products)
    
    # Test 11: Confirm already confirmed
    test_confirm_already_confirmed(products)
    
    # Test 12: Release already released
    test_release_already_released(products)
    
    # Test 13: Get reservations
    test_get_reservations()
    
    # Test 14: Invalid reservation ID
    test_invalid_reservation_id()
    
    # Print summary
    print_summary()
    
    # Exit with appropriate code
    if len(test_results['failed']) > 0:
        exit(1)
    else:
        exit(0)

if __name__ == "__main__":
    main()
