# Makefile for Dialpad Logs System

.PHONY: help
help: ## Show this help message
	@echo 'Usage: make [target]'
	@echo ''
	@echo 'Available targets:'
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

.PHONY: setup
setup: ## Initial setup - copy env file and build containers
	@echo "Setting up environment..."
	@cp -n .env.example .env 2>/dev/null || echo ".env already exists"
	@echo "Please edit .env file and add your DIALPAD_TOKEN"
	@echo "Then run: make build"

.PHONY: build
build: ## Build all Docker containers
	@echo "Building Docker containers..."
	docker-compose build --no-cache

.PHONY: up
up: ## Start all services
	@echo "Starting all services..."
	docker-compose up -d
	@echo "Services started!"
	@echo "Frontend: http://localhost:3000"
	@echo "Backend: http://localhost:3001"
	@echo "pgAdmin: http://localhost:5050"

.PHONY: down
down: ## Stop all services
	@echo "Stopping all services..."
	docker-compose down

.PHONY: restart
restart: down up ## Restart all services

.PHONY: logs
logs: ## View logs from all services
	docker-compose logs -f

.PHONY: logs-backend
logs-backend: ## View backend logs
	docker-compose logs -f backend

.PHONY: logs-frontend
logs-frontend: ## View frontend logs
	docker-compose logs -f frontend

.PHONY: logs-db
logs-db: ## View database logs
	docker-compose logs -f postgres

.PHONY: db-shell
db-shell: ## Access PostgreSQL shell
	docker-compose exec postgres psql -U postgres -d dialpad_logs

.PHONY: db-reset
db-reset: ## Reset database (WARNING: deletes all data)
	@echo "WARNING: This will delete all data in the database!"
	@read -p "Are you sure? (y/N): " confirm && [ "$$confirm" = "y" ] || exit 1
	docker-compose down -v
	docker-compose up -d postgres
	@echo "Waiting for database to be ready..."
	@sleep 5
	docker-compose up -d

.PHONY: backend-shell
backend-shell: ## Access backend container shell
	docker-compose exec backend sh

.PHONY: frontend-shell
frontend-shell: ## Access frontend container shell
	docker-compose exec frontend sh

.PHONY: clean
clean: ## Clean up containers, volumes, and images
	@echo "Cleaning up Docker resources..."
	docker-compose down -v --rmi all

.PHONY: status
status: ## Check status of all services
	docker-compose ps

.PHONY: test-db
test-db: ## Test database connection
	docker-compose exec postgres pg_isready -U postgres
	@echo "Database connection test complete"

.PHONY: backup-db
backup-db: ## Backup database to file
	@mkdir -p backups
	@echo "Backing up database..."
	docker-compose exec postgres pg_dump -U postgres dialpad_logs > backups/backup_$$(date +%Y%m%d_%H%M%S).sql
	@echo "Backup saved to backups/backup_$$(date +%Y%m%d_%H%M%S).sql"

.PHONY: restore-db
restore-db: ## Restore database from backup (usage: make restore-db FILE=backups/backup_xxx.sql)
	@if [ -z "$(FILE)" ]; then \
		echo "Please specify backup file: make restore-db FILE=backups/backup_xxx.sql"; \
		exit 1; \
	fi
	@echo "Restoring database from $(FILE)..."
	docker-compose exec -T postgres psql -U postgres -d dialpad_logs < $(FILE)
	@echo "Database restored"

.PHONY: dev
dev: up logs ## Start services and watch logs

.PHONY: prod
prod: ## Start services in production mode
	@echo "Starting in production mode..."
	NODE_ENV=production docker-compose up -d

.PHONY: install
install: setup build up ## Complete installation - setup, build, and start
	@echo "Installation complete!"
	@echo "Please ensure you've added your DIALPAD_TOKEN to the .env file"
	@echo "Access the application at http://localhost:3000"