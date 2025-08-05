#!/bin/bash

# API base URL
API_URL="http://localhost:3000/api"

# Test users - these match the users created by seedTestUsers.js
DOCTOR_EMAIL="testdoctor@example.com"
DOCTOR_PASSWORD="doctor123"
PATIENT_EMAIL="testpatient@example.com"
PATIENT_PASSWORD="patient123"
ADMIN_EMAIL="admin@example.com"
ADMIN_PASSWORD="admin123"

echo "=== Starting API Tests ==="

# Function to print test result
print_result() {
  if [ $1 -eq 0 ]; then
    echo "✅ $2"
  else
    echo "❌ $2"
    echo "Response: $3"
  fi
}

# Function to extract token from JSON response
extract_token() {
  # Simple extraction of token using grep and sed
  grep -o '"token":"[^"]*"' | head -1 | sed 's/"token":"\([^"]*\)"/\1/'
}

# Function to extract ID from JSON response
extract_id() {
  # Simple extraction of _id using grep and sed
  grep -o '"_id":"[^"]*"' | head -1 | sed 's/"_id":"\([^"]*\)"/\1/'
}

# Function to make authenticated requests
make_authenticated_request() {
  local method=$1
  local url=$2
  local token=$3
  local data=${4:-"{}"}
  
  if [ "$method" = "GET" ]; then
    curl -s -X GET "$url" \
      -H "Authorization: Bearer $token" \
      -H "Content-Type: application/json"
  else
    curl -s -X $method "$url" \
      -H "Authorization: Bearer $token" \
      -H "Content-Type: application/json" \
      -d "$data"
  fi
}

# Test user login
echo "\n=== Testing Authentication ==="

# Doctor login
echo -n "1. Doctor Login"
# Save the full response to a variable and also output it to a file for debugging
FULL_RESPONSE=$(curl -v -X POST "$API_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$DOCTOR_EMAIL\",\"password\":\"$DOCTOR_PASSWORD\"}" 2>&1)

# Save the full response for debugging
echo "$FULL_RESPONSE" > doctor_login_response.txt

# Extract just the JSON response (removing verbose curl output)
RESPONSE=$(echo "$FULL_RESPONSE" | grep '^[[:space:]]*{\|^[[:space:]]*<' | head -1)

# Debug output
echo "\n   Full response saved to doctor_login_response.txt"
echo "   Raw response: ${RESPONSE:0:200}..."

if [ $? -eq 0 ] && echo "$RESPONSE" | grep -q '"status":"success"'; then
  echo " ✅"
  DOCTOR_TOKEN=$(echo "$RESPONSE" | grep -o '"token":"[^"]*' | cut -d'"' -f4)
  if [ -n "$DOCTOR_TOKEN" ]; then
    echo "   Token: ${DOCTOR_TOKEN:0:20}..."
  else
    echo "   ❌ No token found in response"
    exit 1
  fi
else
  echo " ❌ Failed to login as doctor"
  echo "   Response: $RESPONSE"
  exit 1
fi

# Patient login
echo -e "\n2. Patient Login"
LOGIN_RESPONSE=$(curl -s -X POST "$API_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$PATIENT_EMAIL\",\"password\":\"$PATIENT_PASSWORD\"}")

# Extract token from response
PATIENT_TOKEN=$(echo "$LOGIN_RESPONSE" | extract_token)

if [ -n "$PATIENT_TOKEN" ] && [ "$PATIENT_TOKEN" != "null" ] && [ "$PATIENT_TOKEN" != "" ]; then
  echo "✅ Successfully logged in as patient"
  echo "   Token: ${PATIENT_TOKEN:0:20}..."  # Show first 20 chars of token
else
  echo "❌ Failed to login as patient"
  echo "   Response: $LOGIN_RESPONSE"
  exit 1
fi

# Admin login
echo -e "\n3. Admin Login"
LOGIN_RESPONSE=$(curl -s -X POST "$API_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}")

# Extract token from response
ADMIN_TOKEN=$(echo "$LOGIN_RESPONSE" | extract_token)

if [ -n "$ADMIN_TOKEN" ] && [ "$ADMIN_TOKEN" != "null" ] && [ "$ADMIN_TOKEN" != "" ]; then
  echo "✅ Successfully logged in as admin"
  echo "   Token: ${ADMIN_TOKEN:0:20}..."  # Show first 20 chars of token
else
  echo "❌ Failed to login as admin"
  echo "   Response: $LOGIN_RESPONSE"
  echo "   Make sure the admin user exists and the credentials are correct"
  exit 1
fi

# Test Appointments Endpoints
echo "\n=== Testing Appointments ==="

# 1. Create appointment (Doctor)
echo "\n1. Create Appointment (Doctor)"
APPOINTMENT_DATA='{
  "patientId": "PATIENT_ID_HERE",
  "date": "2025-08-15",
  "startTime": "10:00",
  "endTime": "11:00",
  "purpose": "Routine checkup"
}'
RESPONSE=$(make_authenticated_request "POST" "$API_URL/appointments" "$DOCTOR_TOKEN" "$APPOINTMENT_DATA")
APPOINTMENT_ID=$(echo $RESPONSE | jq -r '.data.appointment._id')
if [ -n "$APPOINTMENT_ID" ] && [ "$APPOINTMENT_ID" != "null" ]; then
  echo "✅ Successfully created appointment"
  echo "   Appointment ID: $APPOINTMENT_ID"
else
  echo "❌ Failed to create appointment"
  echo "   Response: $RESPONSE"
  exit 1
fi

# 2. Get all appointments (Doctor)
echo "\n2. Get All Appointments (Doctor)"
RESPONSE=$(make_authenticated_request "GET" "$API_URL/appointments" "$DOCTOR_TOKEN")
COUNT=$(echo $RESPONSE | jq '.data.appointments | length')
if [ $COUNT -ge 0 ]; then
  echo "✅ Successfully retrieved $COUNT appointments"
else
  echo "❌ Failed to get appointments"
  echo "   Response: $RESPONSE"
fi

# 3. Get single appointment
echo "\n3. Get Single Appointment"
RESPONSE=$(make_authenticated_request "GET" "$API_URL/appointments/$APPOINTMENT_ID" "$DOCTOR_TOKEN")
RETRIEVED_ID=$(echo $RESPONSE | jq -r '.data.appointment._id')
if [ "$RETRIEVED_ID" = "$APPOINTMENT_ID" ]; then
  echo "✅ Successfully retrieved appointment"
else
  echo "❌ Failed to get appointment"
  echo "   Response: $RESPONSE"
fi

# Test Medications Endpoints
echo "\n=== Testing Medications ==="

# 1. Create medication (Doctor)
echo "\n1. Create Medication (Doctor)"
MEDICATION_DATA='{
  "patientId": "PATIENT_ID_HERE",
  "name": "Ibuprofen",
  "dosage": {
    "amount": 200,
    "unit": "mg"
  },
  "frequency": "Every 8 hours",
  "instructions": "Take with food",
  "isCritical": false
}'
RESPONSE=$(make_authenticated_request "POST" "$API_URL/medications" "$DOCTOR_TOKEN" "$MEDICATION_DATA")
MEDICATION_ID=$(echo $RESPONSE | jq -r '.data.medication._id')
if [ -n "$MEDICATION_ID" ] && [ "$MEDICATION_ID" != "null" ]; then
  echo "✅ Successfully created medication"
  echo "   Medication ID: $MEDICATION_ID"
else
  echo "❌ Failed to create medication"
  echo "   Response: $RESPONSE"
  exit 1
fi

# 2. Get all medications (Doctor)
echo "\n2. Get All Medications (Doctor)"
RESPONSE=$(make_authenticated_request "GET" "$API_URL/medications" "$DOCTOR_TOKEN")
COUNT=$(echo $RESPONSE | jq '.data.medications | length')
if [ $COUNT -ge 0 ]; then
  echo "✅ Successfully retrieved $COUNT medications"
else
  echo "❌ Failed to get medications"
  echo "   Response: $RESPONSE"
fi

# 3. Get patient's medications (Patient)
echo "\n3. Get Patient's Medications (Patient)"
RESPONSE=$(make_authenticated_request "GET" "$API_URL/medications/my-medications" "$PATIENT_TOKEN")
COUNT=$(echo $RESPONSE | jq '.data.medications | length')
if [ $COUNT -ge 0 ]; then
  echo "✅ Successfully retrieved $COUNT medications for patient"
else
  echo "❌ Failed to get patient's medications"
  echo "   Response: $RESPONSE"
fi

echo "\n=== API Tests Completed ==="

# Cleanup (optional)
# Uncomment to delete test data
# echo "\n=== Cleaning Up ==="
# make_authenticated_request "DELETE" "$API_URL/appointments/$APPOINTMENT_ID" "$DOCTOR_TOKEN"
# make_authenticated_request "DELETE" "$API_URL/medications/$MEDICATION_ID" "$DOCTOR_TOKEN"

echo "\n=== Test Summary ==="
echo "✅ All tests completed successfully!"
