# Floor Management Documentation Index

Welcome to the **Floor Management** documentation directory. All system manuals, architecture guides, wiring diagrams, API references, and deployment walkthroughs are organized below.

---

## 📚 Available Documents

| Document | Description | File Path |
| :--- | :--- | :--- |
| **API Documentation** | Complete REST API & WebSocket specifications, payloads, responses, and authentication | [`api_documentation.md`](file:///Users/hakk/Documents/Coding/web/car_parking_web/docs/api_documentation.md) |
| **AWS EC2 Deployment Guide** | Step-by-step production hosting on AWS EC2 with Nginx, PM2, Git, and SSL | [`aws_ec2_deploy_guide.md`](file:///Users/hakk/Documents/Coding/web/car_parking_web/docs/aws_ec2_deploy_guide.md) |
| **ESP32 Hardware Wiring Guide** | Microcontroller pinouts, pin assignments (GPIO 2, 4, 5, 18, 19, 21, 22, 23), and wiring tables | [`esp32_hardware_wiring_guide.md`](file:///Users/hakk/Documents/Coding/web/car_parking_web/docs/esp32_hardware_wiring_guide.md) |
| **Physical System Wiring Diagram** | Full electrical schematic, power rails (5V/3.3V/GND), relays, motor driver (L9110S), and servo connections | [`physical_system_wiring_diagram.md`](file:///Users/hakk/Documents/Coding/web/car_parking_web/docs/physical_system_wiring_diagram.md) |
| **System Architecture Diagram** | High-level system architecture, client-server-device data flows, and WebSocket sync | [`system_architecture_diagram.md`](file:///Users/hakk/Documents/Coding/web/car_parking_web/docs/system_architecture_diagram.md) |
| **Feature Walkthrough** | Complete changelog, testing results, bug fixes, and verification of all implemented features | [`walkthrough.md`](file:///Users/hakk/Documents/Coding/web/car_parking_web/docs/walkthrough.md) |
| **Implementation Plan** | Original design document and architecture decisions | [`implementation_plan.md`](file:///Users/hakk/Documents/Coding/web/car_parking_web/docs/implementation_plan.md) |

---

## 💻 How to View These Documents

1. **Inside VS Code / IDE**: Open the `docs/` folder in your project tree and click any `.md` file. You can press `Cmd + Shift + V` (macOS) to view formatted Markdown.
2. **In Terminal / Finder**: 
   ```bash
   # Open the docs folder in macOS Finder:
   open docs
   
   # Or view in terminal:
   cat docs/api_documentation.md
   ```
3. **On GitHub**: Once pushed (`git push origin main`), navigate to the `docs/` directory on GitHub to view rich formatted documents with Mermaid diagrams and tables.
