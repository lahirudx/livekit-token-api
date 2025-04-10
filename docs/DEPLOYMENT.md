# Deployment Guide

## Prerequisites
- AWS EC2 instance (Ubuntu recommended)
- Domain name pointing to EC2 IP
- Git repository access
- AWS Security Groups configured (ports 22, 80, 443)

## Initial Server Setup

1. SSH into your EC2 instance:
```bash
ssh ubuntu@your-ec2-ip
```

2. Update system and install prerequisites:
```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
sudo apt install -y docker.io docker-compose

# Start Docker
sudo systemctl start docker
sudo systemctl enable docker

# Add your user to docker group
sudo usermod -aG docker ubuntu

# Restart Docker
sudo systemctl restart docker

# Log out and log back in for group changes to take effect
exit
# SSH back in: ssh ubuntu@your-ec2-ip

# Verify Docker access
docker ps
```

3. Create project directory:
```bash
sudo mkdir -p /opt/wiink-server
sudo chown ubuntu:ubuntu /opt/wiink-server
cd /opt/wiink-server
```

## Application Deployment

1. Clone the repository:
```bash
git clone <your-repo-url> .
```

2. Set up environment:
```bash
# Create necessary directories
mkdir -p nginx/letsencrypt nginx/www

# Make init script executable
chmod +x init-letsencrypt.sh

# Create .env file with your production values
nano .env
```

3. Configure AWS Security Groups:
- Open port 22 (SSH)
- Open port 80 (HTTP)
- Open port 443 (HTTPS)
- Open port 27017 (MongoDB, if needed)

4. Set up DNS:
- Point your domain to EC2's public IP
- Wait for DNS propagation (can take up to 48h)

5. Start the services:
```bash
# Build and start containers
docker-compose up -d --build

# Initialize SSL certificates
./init-letsencrypt.sh
```

## Verification

1. Check container status:
```bash
docker-compose ps
```

2. Check logs:
```bash
docker-compose logs -f
```

3. Verify SSL:
```bash
docker-compose exec certbot certbot certificates
```

## Maintenance

1. Update script:
```bash
# Create update script
cat > update.sh << 'EOF'
#!/bin/bash
cd /opt/wiink-server
git pull
docker-compose down
docker-compose up -d --build
EOF

chmod +x update.sh
```

2. To update the application:
```bash
cd /opt/wiink-server
./update.sh
```

## Troubleshooting

1. Check container logs:
```bash
docker-compose logs -f
```

2. Check Nginx configuration:
```bash
docker-compose exec nginx nginx -t
```

3. Check MongoDB:
```bash
docker-compose exec mongodb mongosh
```

4. Check SSL certificates:
```bash
docker-compose exec certbot certbot certificates
```

## Important Notes

1. Security:
- Keep .env file secure
- Regularly update system and packages
- Monitor server resources
- Set up proper logging

2. Backups:
- Regularly backup MongoDB data
- Consider setting up automated backups

3. Monitoring:
- Set up monitoring tools (e.g., htop)
- Monitor disk space
- Monitor container health

4. Updates:
- Test updates in staging environment
- Have rollback plan ready
- Document all changes

## Common Issues

1. Docker Permission Issues:
```bash
# If you get permission errors with Docker
sudo usermod -aG docker $USER
sudo systemctl restart docker
# Log out and log back in
exit
# SSH back in: ssh ubuntu@your-ec2-ip
```

2. Permission Issues:
```bash
# If you get permission errors
sudo chown -R ubuntu:ubuntu /opt/wiink-server
```

3. Docker Issues:
```bash
# Restart Docker
sudo systemctl restart docker
```

4. SSL Issues:
```bash
# Renew certificates manually
docker-compose exec certbot certbot renew
```

5. MongoDB Issues:
```bash
# Check MongoDB logs
docker-compose logs mongodb
```

## Support

For issues:
1. Check logs
2. Verify configurations
3. Check system resources
4. Contact development team 