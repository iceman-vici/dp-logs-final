#!/bin/bash

# Webhook Testing Script
# This script helps you test the Dialpad webhook endpoint

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default configuration
WEBHOOK_URL="${WEBHOOK_URL:-http://localhost:3001/webhook}"
WEBHOOK_TEST_URL="${WEBHOOK_TEST_URL:-http://localhost:3001/webhook/test}"
WEBHOOK_HEALTH_URL="${WEBHOOK_HEALTH_URL:-http://localhost:3001/webhook/health}"
WEBHOOK_STATS_URL="${WEBHOOK_STATS_URL:-http://localhost:3001/webhook/stats}"
WEBHOOK_LOGS_URL="${WEBHOOK_LOGS_URL:-http://localhost:3001/webhook/logs}"

# Function to print colored output
print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

# Function to print section header
print_header() {
    echo -e "\n${BLUE}========================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}========================================${NC}\n"
}

# Test 1: Health Check
test_health() {
    print_header "Test 1: Health Check"
    print_info "Testing webhook health endpoint..."
    
    response=$(curl -s "$WEBHOOK_HEALTH_URL")
    
    if echo "$response" | grep -q '"success":true'; then
        print_success "Webhook health check passed!"
        echo "$response" | jq '.' 2>/dev/null || echo "$response"
    else
        print_error "Webhook health check failed!"
        echo "$response"
        return 1
    fi
}

# Test 2: Statistics
test_stats() {
    print_header "Test 2: Statistics Check"
    print_info "Fetching webhook statistics..."
    
    response=$(curl -s "$WEBHOOK_STATS_URL")
    
    if echo "$response" | grep -q '"success":true'; then
        print_success "Statistics retrieved successfully!"
        echo "$response" | jq '.' 2>/dev/null || echo "$response"
    else
        print_error "Failed to retrieve statistics!"
        echo "$response"
        return 1
    fi
}

# Test 3: Test Endpoint (Development only)
test_webhook() {
    print_header "Test 3: Test Webhook Endpoint"
    print_info "Sending test payload to webhook..."
    
    payload=$(cat <<EOF
{
  "call": {
    "id": "test_$(date +%s)",
    "direction": "inbound",
    "state": "completed",
    "date_started": $(date +%s)000,
    "date_ended": $(($(date +%s) + 120))000,
    "duration": 120,
    "external_number": "+12025551234",
    "internal_number": "+14155559876",
    "contact": {
      "id": "test_contact_$(date +%s)",
      "name": "Test Contact",
      "email": "test@example.com",
      "phone": "+12025551234"
    },
    "target": {
      "id": "test_user_$(date +%s)",
      "name": "Test User",
      "email": "user@company.com"
    }
  }
}
EOF
)
    
    response=$(curl -s -X POST "$WEBHOOK_TEST_URL" \
        -H "Content-Type: application/json" \
        -d "$payload")
    
    if echo "$response" | grep -q '"success":true'; then
        print_success "Test webhook processed successfully!"
        echo "$response" | jq '.' 2>/dev/null || echo "$response"
    else
        print_error "Test webhook failed!"
        echo "$response"
        
        # Check if it's because we're in production
        if echo "$response" | grep -q "not available in production"; then
            print_warning "Test endpoint is disabled in production mode"
            print_info "This is expected behavior for production environments"
        fi
        return 1
    fi
}

# Test 4: View Recent Logs
test_logs() {
    print_header "Test 4: Recent Webhook Logs"
    print_info "Fetching recent webhook logs..."
    
    response=$(curl -s "$WEBHOOK_LOGS_URL?limit=5")
    
    if echo "$response" | grep -q '"success":true'; then
        print_success "Logs retrieved successfully!"
        echo "$response" | jq '.' 2>/dev/null || echo "$response"
    else
        print_error "Failed to retrieve logs!"
        echo "$response"
        return 1
    fi
}

# Test 5: Full Payload Test with Example File
test_full_payload() {
    print_header "Test 5: Full Payload Test"
    
    example_file="docs/examples/webhook-payload-example.json"
    
    if [ -f "$example_file" ]; then
        print_info "Testing with example payload from $example_file..."
        
        response=$(curl -s -X POST "$WEBHOOK_TEST_URL" \
            -H "Content-Type: application/json" \
            -d @"$example_file")
        
        if echo "$response" | grep -q '"success":true'; then
            print_success "Full payload test passed!"
            echo "$response" | jq '.' 2>/dev/null || echo "$response"
        else
            print_error "Full payload test failed!"
            echo "$response"
            return 1
        fi
    else
        print_warning "Example payload file not found: $example_file"
        print_info "Skipping full payload test"
        return 1
    fi
}

# Main test runner
run_all_tests() {
    print_header "Dialpad Webhook Test Suite"
    print_info "Testing webhook endpoint: $WEBHOOK_URL"
    
    failed_tests=0
    
    test_health || ((failed_tests++))
    test_stats || ((failed_tests++))
    test_webhook || ((failed_tests++))
    test_logs || ((failed_tests++))
    test_full_payload || ((failed_tests++))
    
    print_header "Test Summary"
    
    if [ $failed_tests -eq 0 ]; then
        print_success "All tests passed! ✨"
        return 0
    else
        print_error "$failed_tests test(s) failed!"
        return 1
    fi
}

# Show usage
show_usage() {
    cat << EOF
Dialpad Webhook Test Script

Usage: $0 [command] [options]

Commands:
    all         Run all tests (default)
    health      Test health endpoint
    stats       Test statistics endpoint
    webhook     Test webhook with sample data
    logs        View recent webhook logs
    payload     Test with full example payload
    help        Show this help message

Options:
    --url URL   Set webhook base URL (default: http://localhost:3001/webhook)

Examples:
    $0 all
    $0 health
    $0 webhook --url https://your-domain.com/webhook
    
Environment Variables:
    WEBHOOK_URL         Base webhook URL
    WEBHOOK_TEST_URL    Test endpoint URL
    WEBHOOK_HEALTH_URL  Health check URL
    WEBHOOK_STATS_URL   Statistics URL
    WEBHOOK_LOGS_URL    Logs URL

EOF
}

# Parse command line arguments
command="${1:-all}"

case "$command" in
    all)
        run_all_tests
        ;;
    health)
        test_health
        ;;
    stats)
        test_stats
        ;;
    webhook)
        test_webhook
        ;;
    logs)
        test_logs
        ;;
    payload)
        test_full_payload
        ;;
    help|--help|-h)
        show_usage
        ;;
    *)
        print_error "Unknown command: $command"
        show_usage
        exit 1
        ;;
esac
