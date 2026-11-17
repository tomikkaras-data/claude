-- Script  ->  put in ServerScriptService, name it "Leaderstats"
-- Fixed version of your leaderboard/coin script (use ONLY ONE copy of it in the game).
-- Fixes: the original called GetAsync where it meant SetAsync, had no error handling
-- (DataStore calls can fail and stop the script), and did not save when the server shuts down.

local Players = game:GetService("Players")
local DataStoreService = game:GetService("DataStoreService")

local ds = DataStoreService:GetDataStore("Game")

local function keyFor(plr)
	return "id_" .. plr.UserId
end

Players.PlayerAdded:Connect(function(plr)
	local leaderstats = Instance.new("Folder")
	leaderstats.Name = "leaderstats"
	leaderstats.Parent = plr

	local Cash = Instance.new("IntValue")
	Cash.Name = "Cash"
	Cash.Value = 0
	Cash.Parent = leaderstats

	local ok, saved = pcall(function()
		return ds:GetAsync(keyFor(plr))
	end)
	if ok and saved then
		Cash.Value = saved[1] or 0
	elseif not ok then
		warn("Could not load data for " .. plr.Name .. ": " .. tostring(saved))
	end
end)

local function save(plr)
	local stats = plr:FindFirstChild("leaderstats")
	if not stats then return end
	local ok, err = pcall(function()
		ds:SetAsync(keyFor(plr), { stats.Cash.Value })
	end)
	if not ok then
		warn("Could not save data for " .. plr.Name .. ": " .. tostring(err))
	end
end

Players.PlayerRemoving:Connect(save)

game:BindToClose(function()
	for _, plr in ipairs(Players:GetPlayers()) do
		save(plr)
	end
end)
