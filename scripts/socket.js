var inventory = window.inventoryService;

function startListenToSocket() {
    inventory.init(global.config.locale);
    console.log("Connecting to " + global.config.websocket);
    listenToWebSocket();
}

function listenToWebSocket() {
    var pkmSettings = localStorage.getItem("pokemonSettings");
    if (pkmSettings) {
        global.pokemonSettings = JSON.parse(pkmSettings);
    } else {
        global.pokemonSettings = {};
    }

    ws = new WebSocket(global.config.websocket);
    global.ws = ws;
    global.connected = false;
    ws.onclose = (evt) => {
        $(".loading").text("Connecting to the bot...");
        setTimeout(listenToWebSocket, 1000);
        if (global.connected) {
            errorToast("Connection lost.");
            global.connected = false;
        }
    };
    ws.onopen = () => { 
        console.log("Connected to Bot");
        global.connected = true;
        $(".loading").text("Waiting to get GPS coordinates from Bot..."); 
    };
    ws.onmessage = function (evt) {
        var msg = JSON.parse(evt.data);
        var command = msg.Command || msg.$type;
        $(".toolbar div").show();
        if (command.indexOf("PokemonSettings") >= 0) {
            var settings = msg.Data.$values;
            global.pokemonSettings = Array.from(msg.Data.$values, elt => {
                elt.EvolutionIds = elt.EvolutionIds.$values;
                return elt;
            })
            localStorage.setItem("pokemonSettings", JSON.stringify(global.pokemonSettings));
        } else if (command.indexOf("ProfileEvent") >= 0) {
            // once connected, ask for pokemon settings
            var username = msg.Profile.PlayerData.Username;
            global.username = username;
            global.storage = {
                pokemon: msg.Profile.PlayerData.MaxPokemonStorage,
                items: msg.Profile.PlayerData.MaxItemStorage
            }
            document.title = `[${username}] ${document.title}`;
            ws.send(JSON.stringify({ Command: "GetPokemonSettings" }));
        } else if (command.indexOf("UpdatePositionEvent") >= 0) {
            if (!global.snipping) {
                global.map.addToPath({ 
                    lat: msg.Latitude, 
                    lng: msg.Longitude 
                });
            }
        } else if (command.indexOf("PokemonCaptureEvent") >= 0) {
        		global.gauge.set(0.1);
            if (msg.Status = 1 && msg.Exp > 0) {
                var pkm = {
                    id: msg.Id,
                    name: inventory.getPokemonName(msg.Id),
                    cp: msg.Cp,
                    iv: msg.Perfection,
                    lvl: msg.Level,
                    lat: msg.Latitude,
                    lng: msg.Longitude
                };
                global.map.addCatch(pkm);
                pokemonToast(pkm, { ball: msg.Pokeball });
            }
        } else if (command.indexOf("FortUsedEvent") >= 0) {
            //console.log(msg);
            global.gauge.set(0.1);
            if (msg.Latitude && msg.Longitude) {
                global.map.addVisitedPokestop({
                    id: msg.Id,
                    name: msg.Name,
                    lat: msg.Latitude,
                    lng: msg.Longitude
                });
            }
        } else if (command.indexOf("PokeStopListEvent") >= 0) {
            var forts = Array.from(msg.Forts.$values.filter(f => f.Type == 1), f => {
                return {
                    id: f.Id,
                    lat: f.Latitude,
                    lng: f.Longitude
                }
            });
            global.map.addPokestops(forts);
        } else if (command.indexOf("SnipeModeEvent") >= 0) {
            if (msg.Active) console.log("Sniper Mode");
            global.snipping = msg.Active;
        } else if (command.indexOf("PokemonListEvent") >= 0) {
            var pkm = Array.from(msg.PokemonList.$values, p => {
                var pkmInfo = global.pokemonSettings[p.Item1.PokemonId - 1];
                return {
                    id: p.Item1.Id,
                    pokemonId: p.Item1.PokemonId,
                    inGym: p.Item1.DeployedFortId != "",
                    canEvolve: pkmInfo && pkmInfo.EvolutionIds.length > 0,
                    cp: p.Item1.Cp,
                    iv: p.Item2.toFixed(1),
                    name: p.Item1.Nickname || inventory.getPokemonName(p.Item1.PokemonId),
                    realname: inventory.getPokemonName(p.Item1.PokemonId, "en"),
                    candy: p.Item3,
                    candyToEvolve: pkmInfo ? pkmInfo.CandyToEvolve : 0,
                    favorite: p.Item1.Favorite != 0,
                    lvl: inventory.getPokemonLevel(p.Item1),
                }
            });
            global.map.displayPokemonList(pkm);
        } else if (command.indexOf("EggsListEvent") >= 0) {
            var incubators = Array.from(msg.Incubators.$values, i => {
                if (i.TargetKmWalked != 0 || i.StartKmWalked != 0) {
                    msg.PlayerKmWalked = msg.PlayerKmWalked || 0;
                    return {
                        type: i.ItemId == 901 ? "incubator-unlimited" : "incubator",
                        totalDist: i.TargetKmWalked - i.StartKmWalked,
                        doneDist: msg.PlayerKmWalked - i.StartKmWalked
                    }
                }
            });
            var eggs = Array.from(msg.UnusedEggs.$values, i => {
                return {
                    type: "egg",
                    totalDist: i.EggKmWalkedTarget,
                    doneDist: i.EggKmWalkedStart
                }
            });
            eggs = incubators.concat(eggs).filter(e => e);
            global.map.displayEggsList(eggs);
        } else if (command.indexOf("InventoryListEvent") >= 0) {
            var items = Array.from(msg.Items.$values, item => {
                return {
                    name: inventory.getItemName(item.ItemId),
                    itemId: item.ItemId,
                    count: item.Count,
                    unseen: item.Unseen
                }
            });
            global.map.displayInventory(items);
        } else if (command.indexOf("PokemonEvolveEvent") >= 0) {
            var pkm = {
                id: msg.Id,
                name: inventory.getPokemonName(msg.Id)
            };
            pokemonToast(pkm, { title: "A Pokemon Evolved" });
				} else if (command.indexOf("HumanWalkSnipEvent") >= 0) { 
					   var Now = (new Date()).getTime();
					   var ed = new Date();
					   var values = msg.Data.$values.filter( p => {
					   		return (Date.parse(p.ExpiredTime)- 5 > Now)
					   });

             var pkm = Array.from(values, p => {
             		ed.setTime(Date.parse(p.ExpiredTime) - Now);
             	  expired = `${ed.getUTCHours()}:${ed.getUTCMinutes()}:${ed.getUTCSeconds()}`;
                return {
                    id: p.Id,
                    pokemonId: p.PokemonId,
                    distance: p.Distance,
                    estimatedTime: p.EstimatedTime,
                    expiredTime: expired,
										isCatching: p.IsCatching,
										isFake: p.IsFake,
										isVisited: p.IsVisited,
										latitude: p.Latitude,
										longitude: p.Longitude,
										uniqueId: p.UniqueId,
										favorite: false,
										name: inventory.getPokemonName(p.PokemonId)
                }
            });
            global.map.displaySnipeList(pkm);
        } else if (command.indexOf("TrainerProfile") >= 0) {    
						    if (global.config.noPopup) return;
						
						    var title =  msg.Data.Profile.Username;
						    var toast = toastr.info;

						    Trainerinfo = `lvl ${msg.Data.Stats.Level} (${msg.Data.Stats.Experience}/${msg.Data.Stats.NextLevelXp}) `;
						
						    var content = `<div>${Trainerinfo}</div><div>`;
						    if(global.config.locale=='en')
						    {
						    	content += `Poke Coin: ${msg.Data.Profile.Currencies.$values[0].Amount} `;
						    	content += `Stardust: ${msg.Data.Profile.Currencies.$values[1].Amount} <br />`;
							    content += `Battle: ${msg.Data.Stats.BattleAttackTotal} Won:${msg.Data.Stats.BattleAttackWon} Defended: ${msg.Data.Stats.BattleDefendedWon}<br />`;
							    content += `Training: ${msg.Data.Stats.BattleTrainingTotal} Won:Training: ${msg.Data.Stats.BattleTrainingWon}<br />`;
							    content += `Eggs Hatched: ${msg.Data.Stats.EggsHatched} <br />`;
							    content += `Evolutions: ${msg.Data.Stats.Evolutions} <br />`;						    
							    content += `Walked: ${msg.Data.Stats.KmWalked} km <br />`;
							    content += `Captured:${(msg.Data.Stats.PokemonsCaptured/msg.Data.Stats.PokemonsEncountered*100).toFixed(2)}% (${msg.Data.Stats.PokemonsCaptured}/${msg.Data.Stats.PokemonsEncountered}) <br />`;
						    }
						    if(global.config.locale=='tw')
						    {
						    	content += `金幣: ${msg.Data.Profile.Currencies.$values[0].Amount} `;
						    	content += `星塵: ${msg.Data.Profile.Currencies.$values[1].Amount} <br />`;
							    content += `戰鬥: ${msg.Data.Stats.BattleAttackTotal} 勝利:${msg.Data.Stats.BattleAttackWon} 已防禦: ${msg.Data.Stats.BattleDefendedWon}<br />`;
							    content += `修練: ${msg.Data.Stats.BattleTrainingTotal} 勝利: ${msg.Data.Stats.BattleTrainingWon}<br />`;					    				    
							    content += `孵蛋次數: ${msg.Data.Stats.EggsHatched} <br />`;
							    content += `進化次數: ${msg.Data.Stats.Evolutions} <br />`;						    
							    content += `行走距離: ${msg.Data.Stats.KmWalked} km <br />`;
							    content += `抓取率:${(msg.Data.Stats.PokemonsCaptured/msg.Data.Stats.PokemonsEncountered*100).toFixed(2)}% (${msg.Data.Stats.PokemonsCaptured}/${msg.Data.Stats.PokemonsEncountered}) <br />`;
						    }
						    content += `</div>`;
						    toast(content, title, {
						        "progressBar": true,
						        "positionClass": "toast-bottom-left",
						        "timeOut": "10000",
						        "closeButton": true
						    })
        } else if (command.indexOf("PathEvent") >= 0) {
            var json = "[" + msg.StringifiedPath + "]";
            json = json.replace(/lat/g, '"lat"').replace(/lng/g, '"lng"');
            global.map.setRoute(JSON.parse(json));
        } else if (command.indexOf("set_destination") >= 0) {
            global.map.manualDestinationReached()
        } else if (command.indexOf("TransferPokemonEvent") >= 0) {
        	console.log("Socket TransferPokemonEvent no handler");
            // nothing
        } else if (command.indexOf("FortTargetEvent") >= 0) {        	
        	console.log("Socket FortTargetEvent no handler");
            // nothing
        } else if (command.indexOf("NoticeEvent") >= 0) {
        	console.log("Socket NoticeEvent no handler");
            // nothing
        } else if (command.indexOf("WarnEvent") >= 0) {
        	console.log("Socket WarnEvent no handler");
            // nothing
        } else if (command.indexOf("SnipeScanEvent") >= 0) {
        	console.log("Socket SnipeScanEvent no handler");
            // nothing
        } else if (command.indexOf("ItemRecycledEvent") >= 0) {
        	console.log("Socket ItemRecycledEvent no handler");
            // nothing
        } else if (command.indexOf("EvolveCountEvent") >= 0) {
        	console.log("Socket EvolveCountEvent no handler");
            // nothing
        } else if (command.indexOf("DebugEvent") >= 0) {
        	console.log("Socket DebugEvent no handler");
            // nothing
        } else if (command.indexOf("SnipeEvent") >= 0) {
        	console.log("Socket SnipeEvent no handler");
            // nothing
        } else if (command.indexOf("EggIncubatorStatusEvent") >= 0) {
        	console.log("Socket EggIncubatorStatusEvent no handler");
            // nothing
        } else if (command.indexOf("HumanWalkingEvent") >= 0) {
        	global.gauge.set(msg.CurrentWalkingSpeed*100);
            // nothing
        } else if (command.indexOf("UnaccurateLocation") >= 0) {
        	console.log("Socket UnaccurateLocation no handler");
            // nothing 
        } else if (command.indexOf("UseBerryEvent") >= 0) {
        	console.log("Socket UseBerryEvent no handler");
            // nothing
        } else if (command.indexOf("ErrorEvent") >= 0) {
            console.log(msg.Message);
        } else {
            console.log(msg);
        }
    };
}

function errorToast(message) {
    toastr.error(message, "Error", {
        "progressBar": true,
        "positionClass": "toast-top-left",
        "timeOut": "5000",
        "closeButton": true
    });
}

function pokemonToast(pkm, options) {
    if (global.config.noPopup) return;

    options = options || {};
    var title = options.title || ( global.snipping ? "Snipe success" : "Catch success" );
    var toast = global.snipping ? toastr.success : toastr.info;
    var pkminfo = pkm.name;
    if (pkm.lvl) pkminfo += ` (lvl ${pkm.lvl})`;

    var content = `<div>${pkminfo}</div><div>`;
    content += `<img src='./assets/pokemon/${pkm.id}.png' height='50' />`;
    if (options.ball) content += `<img src='./assets/inventory/${options.ball}.png' height='30' />`;
    content += `</div>`;
    toast(content, title, {
        "progressBar": true,
        "positionClass": "toast-bottom-left",
        "timeOut": "5000",
        "closeButton": true
    })
}