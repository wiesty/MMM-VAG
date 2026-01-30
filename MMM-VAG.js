Module.register("MMM-VAG", {
    defaults: {
        maxEntries: 5,
        stopId: 510,
        filter: {},
        displayNotifications: true,
        displayBundled: false,
        scrollSpeed: 40,
        minTimeUntilDeparture: 0
    },

    start () {
        Log.info(`Starting module: ${this.name} with identifier: ${this.identifier}`);
        this.departures = [];
        this.filteredDepartures = [];
        this.loadDepartures();
        this.scheduleUpdate();
        this.scheduleMinuteUpdate();
    },

    getStyles () {
        return ["MMM-VAG.css"];
    },

    getHeader () {
        return this.config.header && (this.config.header !== "") ? this.config.header : "VAG Abfahrtsmonitor";
    },

    getDom () {
        const wrapper = document.createElement("div");
        wrapper.classList.add("vag-table-wrapper");

        if (this.filteredDepartures.length > 0) {
            const table = document.createElement("table");
            table.classList.add("vag-table");

            let bundledNotifications = new Set();

            for (let i = 0; i < this.filteredDepartures.length && i < this.config.maxEntries; i++) {
                const departure = this.filteredDepartures[i];
                const row = document.createElement("tr");
                row.classList.add("departure-row");

                const iconCell = document.createElement("td");
                iconCell.classList.add("icon-cell");
                const lineImage = document.createElement("img");
                lineImage.classList.add("productsvg");
                lineImage.src = this.getLineIcon(departure.line.name || "Bus");
                iconCell.appendChild(lineImage);
                row.appendChild(iconCell);

                const lineCell = document.createElement("td");
                lineCell.classList.add("line-cell");
                lineCell.innerHTML = departure.line.number;
                row.appendChild(lineCell);

                const directionCell = document.createElement("td");
                directionCell.classList.add("direction-cell");
                directionCell.innerHTML = departure.direction;
                row.appendChild(directionCell);

                const timeCell = document.createElement("td");
                timeCell.classList.add("time-cell");
                timeCell.innerHTML = departure.departureLive;
                row.appendChild(timeCell);

                const untilCell = document.createElement("td");
                untilCell.classList.add("until-cell");
                const minutesUntilDeparture = this.calculateTimeUntil(departure.departureLive);
                untilCell.innerHTML = minutesUntilDeparture >= 1 ? `in ${minutesUntilDeparture} Min` : "";
                row.appendChild(untilCell);

                table.appendChild(row);

                if (this.config.displayNotifications && departure.notifications && departure.notifications.length > 0) {
                    departure.notifications.forEach(notification => {
                        const notificationText = notification.text;

                        if (this.config.displayBundled) {
                            // Sammle alle Notifications in einem Set (verhindert Duplikate)
                            bundledNotifications.add(notificationText);
                        } else {
                            // Zeige Notification direkt nach jeder Abfahrt
                            const notificationRow = document.createElement("tr");
                            const notificationCell = document.createElement("td");
                            notificationCell.colSpan = 5;
                            notificationCell.classList.add("notification-cell");
                            const notificationContainer = document.createElement("div");
                            notificationContainer.classList.add("scroll-container");
                            const scrollNotification = document.createElement("div");
                            scrollNotification.classList.add("scroll-text");
                            scrollNotification.innerHTML = notificationText;

                            this.setScrollAnimation(scrollNotification, this.config.scrollSpeed);

                            notificationContainer.appendChild(scrollNotification);
                            notificationCell.appendChild(notificationContainer);
                            notificationRow.appendChild(notificationCell);
                            table.appendChild(notificationRow);
                        }
                    });
                }
            }

            // Falls displayBundled aktiviert ist, füge alle einzigartigen Benachrichtigungen am Ende hinzu
            if (this.config.displayBundled && bundledNotifications.size > 0) {
                bundledNotifications.forEach(notificationText => {
                    const notificationRow = document.createElement("tr");
                    const notificationCell = document.createElement("td");
                    notificationCell.colSpan = 5;
                    notificationCell.classList.add("notification-cell");
                    const notificationContainer = document.createElement("div");
                    notificationContainer.classList.add("scroll-container");
                    const scrollNotification = document.createElement("div");
                    scrollNotification.classList.add("scroll-text");
                    scrollNotification.innerHTML = notificationText;

                    this.setScrollAnimation(scrollNotification, this.config.scrollSpeed);

                    notificationContainer.appendChild(scrollNotification);
                    notificationCell.appendChild(notificationContainer);
                    notificationRow.appendChild(notificationCell);
                    table.appendChild(notificationRow);
                });
            }

            wrapper.appendChild(table);
        } else {
            wrapper.innerHTML = "Keine Abfahrten gefunden.";
        }

        return wrapper;
    },

    setScrollAnimation (scrollTextElement, scrollSpeed) {
        document.body.appendChild(scrollTextElement);
        const scrollWidth = scrollTextElement.scrollWidth;
        document.body.removeChild(scrollTextElement);
        scrollTextElement.style.width = `${scrollWidth}px`;
        const duration = scrollWidth / scrollSpeed;
        scrollTextElement.style.animationDuration = `${duration}s`;
    },

    getLineIcon (productName) {
        const product = productName.toLowerCase();
        if (product.includes("bus")) {
            return this.file("assets/bus.svg");
        } else if (product.includes("tram") || product.includes("strassenbahn")) {
            return this.file("assets/tram.svg");
        } else if (product.includes("u-bahn") || product.includes("ubahn")) {
            return this.file("assets/ubahn.svg");
        } else if (product.includes("s-bahn") || product.includes("sbahn")) {
            return this.file("assets/sbahn.svg");
        } else if (product.includes("rbahn") || product.includes("sbahn")) {
            return this.file("assets/bahn.svg");
        }else {
            return this.file("assets/default.svg");
        }
    },

    calculateTimeUntil (departureTime) {
        const now = new Date();
        const departure = new Date();
        departure.setHours(departureTime.split(":")[0]);
        departure.setMinutes(departureTime.split(":")[1]);
        const diff = Math.floor((departure - now) / (1000 * 60));
        return diff >= 0 ? diff : 0;
    },

    async loadDepartures () {
        const self = this;
        const url = `https://start.vag.de/dm/api/abfahrten.json/vgn/${this.config.stopId}`;
        try {
            const response = await fetch(url);
            if (response.ok) {
                const data = await response.json();
                if (data && data.Abfahrten && data.Abfahrten.length > 0) {
                    self.departures = self.transformVAGData(data.Abfahrten);

                    // Füge Sonderinformationen zu allen Abfahrten hinzu
                    if (data.Sonderinformationen && data.Sonderinformationen.length > 0) {
                        self.departures.forEach(departure => {
                            departure.notifications = data.Sonderinformationen.map(info => ({ text: info }));
                        });
                    }

                    self.departures = self.filterDepartures(self.departures);
                    self.departures.sort((a, b) =>
                        new Date(`1970-01-01T${a.departureLive}:00Z`) - new Date(`1970-01-01T${b.departureLive}:00Z`)
                    );
                    self.updateFilteredDepartures();
                    self.updateDom();
                }
            } else {
                Log.error("[MMM-VAG]: Failed to load departures or no departures found.");
            }
        } catch (error) {
            Log.error("[MMM-VAG]: Error fetching departures:", error);
        }
    },

    transformVAGData (abfahrten) {
        return abfahrten.map(item => {
            // Konvertiere ISO-Zeitstempel zu HH:MM Format
            let departureLive = "";
            if (item.AbfahrtszeitIst) {
                const date = new Date(item.AbfahrtszeitIst);
                departureLive = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
            }

            return {
                line: {
                    name: item.Produkt || "Bus",
                    number: item.Linienname || ""
                },
                direction: item.Richtungstext || "",
                departureLive: departureLive,
                notifications: []
            };
        });
    },

    filterDepartures (departures) {
        const self = this;
        const filterKeys = Object.keys(self.config.filter);
        const minTime = this.config.minTimeUntilDeparture;

        return departures.filter(departure => {
            const minutesUntilDeparture = self.calculateTimeUntil(departure.departureLive);
            if (minutesUntilDeparture < minTime) return false;

            if (filterKeys.length === 0 || self.config.filter.hasOwnProperty("all")) return true;

            const lineFilter = self.config.filter[departure.line.number];
            if (!lineFilter) return false;

            if (Array.isArray(lineFilter)) {
                return lineFilter.includes(departure.direction);
            }

            return departure.direction === lineFilter || lineFilter === "";
        });
    },

    updateFilteredDepartures () {
        const now = new Date();
        this.filteredDepartures = this.departures.filter(departure => {
            const departureDate = new Date();
            departureDate.setHours(departure.departureLive.split(":")[0]);
            departureDate.setMinutes(departure.departureLive.split(":")[1]);
            return departureDate >= now;
        });
    },

    scheduleUpdate () {
        setInterval(() => {
            this.loadDepartures();
        }, 300000);
    },

    scheduleMinuteUpdate () {
        const now = new Date();
        const msUntilNextMinute = (60 - now.getSeconds()) * 1000;

        setTimeout(() => {
            this.updateFilteredDepartures();
            this.updateDom();
            setInterval(() => {
                this.updateFilteredDepartures();
                this.updateDom();
            }, 60000);
        }, msUntilNextMinute);
    }
});
