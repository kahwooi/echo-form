# Build stage
FROM golang:1.25-alpine AS builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache gcc musl-dev

# Copy go mod and sum files
COPY go.mod go.sum ./

# Download dependencies
RUN go mod download

# Copy source code
COPY . .

# Build the application
RUN CGO_ENABLED=0 GOOS=linux go build -o main .

# Final stage
FROM alpine:latest

WORKDIR /app

# Install runtime dependencies
RUN apk add --no-cache tzdata

# Copy the binary and config files from builder
COPY --from=builder /app/main .
COPY --from=builder /app/.env ./.env

# Expose the port your app runs on
EXPOSE 8081

# Run the binary
CMD ["./main"]
