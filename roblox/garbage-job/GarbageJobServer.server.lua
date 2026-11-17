-- Script  ->  put in ServerScriptService, name it "GarbageJobServer"
-- Needs in Workspace:  JobBoard (Part), TrashBins (Folder of Parts/Models), DropOff (Part)
-- Optional:            Truck (Model) containing a Part named "TruckBed"

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

---------------- SETTINGS ----------------
local JOB_TIME = 60        -- seconds
local REWARD_PER_BAG = 10  -- coins (Cash)
local TRUCK_RANGE = 40     -- truck must be this close to DropOff to unload it
local JOB_TITLE = "Garbage Collector"
local JOB_DESCRIPTION = "Empty the marked trash bins (press E) and bring the bags to the drop-off point. "
	.. "You can carry bags, drop them (Backspace) or load them into the truck. "
	.. REWARD_PER_BAG .. " coins per bag!"
------------------------------------------

local function getPart(obj)
	if obj:IsA("BasePart") then return obj end
	if obj:IsA("Model") then return obj.PrimaryPart or obj:FindFirstChildWhichIsA("BasePart", true) end
end

local board = getPart(workspace:WaitForChild("JobBoard"))
local binsFolder = workspace:WaitForChild("TrashBins")
local dropOff = getPart(workspace:WaitForChild("DropOff"))
local truck = workspace:FindFirstChild("Truck")
local truckBed = truck and truck:FindFirstChild("TruckBed", true)

-- Remote events (created automatically)
local remotes = Instance.new("Folder")
remotes.Name = "GarbageJob"
remotes.Parent = ReplicatedStorage
local function newRemote(name)
	local r = Instance.new("RemoteEvent")
	r.Name = name
	r.Parent = remotes
	return r
end
local OfferJob = newRemote("OfferJob")   -- server -> client: show confirm popup
local AcceptJob = newRemote("AcceptJob") -- client -> server: player pressed Accept
local JobUpdate = newRemote("JobUpdate") -- server -> client: job state (timer, bins)
local Notify = newRemote("Notify")       -- server -> client: short message

-- jobs[player] = { endTime = number, emptied = {[binPart] = true}, delivered = number }
local jobs = {}

local function notify(player, text)
	Notify:FireClient(player, text)
end

local function addPrompt(parent, name, action, object)
	local p = Instance.new("ProximityPrompt")
	p.Name = name
	p.ActionText = action
	p.ObjectText = object
	p.KeyboardKeyCode = Enum.KeyCode.E
	p.HoldDuration = 0
	p.MaxActivationDistance = 10
	p.RequiresLineOfSight = false
	p.Parent = parent
	return p
end

local function sendState(player)
	local job = jobs[player]
	if not job then
		JobUpdate:FireClient(player, { active = false })
		return
	end
	local emptied = {}
	for bin in pairs(job.emptied) do table.insert(emptied, bin) end
	JobUpdate:FireClient(player, {
		active = true,
		endTime = job.endTime,
		emptied = emptied,
		delivered = job.delivered,
	})
end

local function getCash(player)
	local stats = player:FindFirstChild("leaderstats")
	return stats and stats:FindFirstChild("Cash")
end

-- Bags the player is holding / has in backpack
local function carriedBags(player)
	local list = {}
	for _, container in ipairs({ player.Character, player:FindFirstChild("Backpack") }) do
		if container then
			for _, t in ipairs(container:GetChildren()) do
				if t:IsA("Tool") and t.Name == "TrashBag" then table.insert(list, t) end
			end
		end
	end
	return list
end

local function makeBag(player)
	local tool = Instance.new("Tool")
	tool.Name = "TrashBag"
	tool.CanBeDropped = true -- Backspace drops it, walk over it to pick it up again
	tool:SetAttribute("Owner", player.UserId)

	local handle = Instance.new("Part")
	handle.Name = "Handle"
	handle.Size = Vector3.new(1.5, 2, 1.5)
	handle.Color = Color3.fromRGB(25, 25, 25)
	handle.Material = Enum.Material.SmoothPlastic
	handle.Parent = tool
	local mesh = Instance.new("SpecialMesh")
	mesh.MeshType = Enum.MeshType.Sphere
	mesh.Parent = handle

	tool.Parent = player.Backpack
	local hum = player.Character and player.Character:FindFirstChildOfClass("Humanoid")
	if hum then hum:EquipTool(tool) end
end

-- Remove every bag that belongs to this player (used when the job ends)
local function removeBags(player)
	local places = { workspace }
	for _, p in ipairs(Players:GetPlayers()) do
		if p:FindFirstChild("Backpack") then table.insert(places, p.Backpack) end
	end
	for _, place in ipairs(places) do
		for _, obj in ipairs(place:GetDescendants()) do
			if obj:GetAttribute("Owner") == player.UserId and obj.Name == "TrashBag" then
				obj:Destroy()
			end
		end
	end
end

local function endJob(player, message)
	local job = jobs[player]
	if not job then return end
	jobs[player] = nil
	removeBags(player)
	if player.Parent then
		sendState(player)
		notify(player, message .. " Bags delivered: " .. job.delivered
			.. " (+" .. job.delivered * REWARD_PER_BAG .. " coins)")
	end
end

---------------- JOB BOARD ----------------
local boardPrompt = addPrompt(board, "JobPrompt", "Take job", JOB_TITLE)
boardPrompt.Triggered:Connect(function(player)
	if jobs[player] then
		notify(player, "You already have a job running!")
		return
	end
	OfferJob:FireClient(player, { title = JOB_TITLE, description = JOB_DESCRIPTION, time = JOB_TIME })
end)

AcceptJob.OnServerEvent:Connect(function(player)
	if jobs[player] then return end
	local root = player.Character and player.Character:FindFirstChild("HumanoidRootPart")
	if not root or (root.Position - board.Position).Magnitude > 25 then return end -- anti-cheat

	local job = { endTime = workspace:GetServerTimeNow() + JOB_TIME, emptied = {}, delivered = 0 }
	jobs[player] = job
	sendState(player)
	notify(player, "Job started! Follow the arrows.")

	task.delay(JOB_TIME, function()
		if jobs[player] == job then endJob(player, "Time's up!") end
	end)
end)

---------------- TRASH BINS ----------------
local function setupBin(obj)
	local bin = getPart(obj)
	if not bin then return end
	local prompt = addPrompt(bin, "BinPrompt", "Collect trash", "Trash bin")
	prompt.Triggered:Connect(function(player)
		local job = jobs[player]
		if not job then
			notify(player, "Take a job at the job board first!")
			return
		end
		if job.emptied[bin] then
			notify(player, "This bin is already empty.")
			return
		end
		job.emptied[bin] = true
		makeBag(player)
		sendState(player)
	end)
end
for _, obj in ipairs(binsFolder:GetChildren()) do setupBin(obj) end
binsFolder.ChildAdded:Connect(setupBin)

---------------- TRUCK (optional) ----------------
local cargo
if truckBed then
	cargo = Instance.new("Folder")
	cargo.Name = "Cargo"
	cargo.Parent = truck

	local loadPrompt = addPrompt(truckBed, "LoadPrompt", "Load bags", "Truck")
	loadPrompt.Triggered:Connect(function(player)
		if not jobs[player] then
			notify(player, "Take a job at the job board first!")
			return
		end
		local bags = carriedBags(player)
		if #bags == 0 then
			notify(player, "You are not carrying any bags.")
			return
		end
		for _, tool in ipairs(bags) do
			tool:Destroy()
			-- visible bag sitting on the truck bed
			local bag = Instance.new("Part")
			bag.Name = "TrashBag"
			bag:SetAttribute("Owner", player.UserId)
			bag.Size = Vector3.new(1.5, 2, 1.5)
			bag.Shape = Enum.PartType.Ball
			bag.Color = Color3.fromRGB(25, 25, 25)
			bag.CanCollide = false
			bag.Massless = true
			local half = truckBed.Size / 2
			bag.CFrame = truckBed.CFrame * CFrame.new(
				math.random() * (half.X * 1.6) - half.X * 0.8,
				half.Y + 1,
				math.random() * (half.Z * 1.6) - half.Z * 0.8)
			local weld = Instance.new("WeldConstraint")
			weld.Part0 = truckBed
			weld.Part1 = bag
			weld.Parent = bag
			bag.Parent = cargo
		end
		notify(player, "Loaded " .. #bags .. " bag(s) into the truck.")
	end)
end

---------------- DROP-OFF ----------------
local dropPrompt = addPrompt(dropOff, "DeliverPrompt", "Deliver bags", "Drop-off")
dropPrompt.MaxActivationDistance = 15
dropPrompt.Triggered:Connect(function(player)
	local job = jobs[player]
	if not job then
		notify(player, "Take a job at the job board first!")
		return
	end

	local count = 0
	for _, tool in ipairs(carriedBags(player)) do
		tool:Destroy()
		count += 1
	end
	if cargo and (truckBed.Position - dropOff.Position).Magnitude <= TRUCK_RANGE then
		for _, bag in ipairs(cargo:GetChildren()) do
			if bag:GetAttribute("Owner") == player.UserId then
				bag:Destroy()
				count += 1
			end
		end
	end

	if count == 0 then
		notify(player, "No bags to deliver. (Is the truck close enough?)")
		return
	end

	local cash = getCash(player)
	if cash then cash.Value += count * REWARD_PER_BAG end
	job.delivered += count
	notify(player, "Delivered " .. count .. " bag(s): +" .. count * REWARD_PER_BAG .. " coins")
	sendState(player)
end)

Players.PlayerRemoving:Connect(function(player)
	endJob(player, "")
end)
