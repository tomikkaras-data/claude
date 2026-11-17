-- LocalScript  ->  put in StarterPlayer > StarterPlayerScripts, name it "GarbageJobClient"
-- Builds all the UI by code: confirm popup, timer, messages and arrows over bins.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local TweenService = game:GetService("TweenService")

local player = Players.LocalPlayer
local remotes = ReplicatedStorage:WaitForChild("GarbageJob")
local OfferJob = remotes:WaitForChild("OfferJob")
local AcceptJob = remotes:WaitForChild("AcceptJob")
local JobUpdate = remotes:WaitForChild("JobUpdate")
local Notify = remotes:WaitForChild("Notify")

local binsFolder = workspace:WaitForChild("TrashBins")
local dropOff = workspace:WaitForChild("DropOff")

local function getPart(obj)
	if obj:IsA("BasePart") then return obj end
	if obj:IsA("Model") then return obj.PrimaryPart or obj:FindFirstChildWhichIsA("BasePart", true) end
end

---------------- UI ----------------
local gui = Instance.new("ScreenGui")
gui.Name = "GarbageJobGui"
gui.ResetOnSpawn = false
gui.Parent = player:WaitForChild("PlayerGui")

local function corner(obj)
	local c = Instance.new("UICorner")
	c.CornerRadius = UDim.new(0, 10)
	c.Parent = obj
end

local function label(parent, text, size, pos, textSize)
	local l = Instance.new("TextLabel")
	l.BackgroundTransparency = 1
	l.Size = size
	l.Position = pos
	l.Text = text
	l.TextColor3 = Color3.new(1, 1, 1)
	l.Font = Enum.Font.GothamBold
	l.TextSize = textSize
	l.TextWrapped = true
	l.Parent = parent
	return l
end

-- Confirm popup
local popup = Instance.new("Frame")
popup.Size = UDim2.fromOffset(360, 230)
popup.AnchorPoint = Vector2.new(0.5, 0.5)
popup.Position = UDim2.fromScale(0.5, 0.5)
popup.BackgroundColor3 = Color3.fromRGB(35, 40, 50)
popup.Visible = false
popup.Parent = gui
corner(popup)

local titleL = label(popup, "", UDim2.new(1, -20, 0, 36), UDim2.fromOffset(10, 8), 24)
local descL = label(popup, "", UDim2.new(1, -20, 0, 90), UDim2.fromOffset(10, 46), 15)
descL.Font = Enum.Font.Gotham
local timeL = label(popup, "", UDim2.new(1, -20, 0, 24), UDim2.fromOffset(10, 138), 17)
timeL.TextColor3 = Color3.fromRGB(255, 210, 80)

local function button(text, color, x)
	local b = Instance.new("TextButton")
	b.Size = UDim2.fromOffset(150, 42)
	b.Position = UDim2.fromOffset(x, 175)
	b.BackgroundColor3 = color
	b.Text = text
	b.TextColor3 = Color3.new(1, 1, 1)
	b.Font = Enum.Font.GothamBold
	b.TextSize = 18
	b.Parent = popup
	corner(b)
	return b
end
local acceptB = button("Accept", Color3.fromRGB(60, 170, 80), 20)
local declineB = button("Decline", Color3.fromRGB(190, 60, 60), 190)

acceptB.Activated:Connect(function()
	popup.Visible = false
	AcceptJob:FireServer()
end)
declineB.Activated:Connect(function()
	popup.Visible = false
end)

OfferJob.OnClientEvent:Connect(function(info)
	titleL.Text = info.title
	descL.Text = info.description
	timeL.Text = "Time limit: " .. info.time .. " seconds"
	popup.Visible = true
end)

-- Timer HUD
local hud = label(gui, "", UDim2.fromOffset(320, 40), UDim2.new(0.5, -160, 0, 10), 22)
hud.BackgroundTransparency = 0.3
hud.BackgroundColor3 = Color3.fromRGB(20, 20, 20)
hud.Visible = false
corner(hud)

-- Messages
local msg = label(gui, "", UDim2.fromOffset(500, 36), UDim2.new(0.5, -250, 0, 60), 18)
msg.TextStrokeTransparency = 0.5
local msgId = 0
Notify.OnClientEvent:Connect(function(text)
	msgId += 1
	local myId = msgId
	msg.Text = text
	msg.TextTransparency = 0
	task.wait(3)
	if msgId == myId then
		TweenService:Create(msg, TweenInfo.new(0.5), { TextTransparency = 1 }):Play()
	end
end)

---------------- ARROWS ----------------
local arrows = {} -- [part] = BillboardGui

local function makeArrow(part, color)
	local bb = Instance.new("BillboardGui")
	bb.Adornee = part
	bb.AlwaysOnTop = true
	bb.Size = UDim2.fromOffset(60, 60)
	bb.StudsOffset = Vector3.new(0, 5, 0)
	bb.Enabled = false
	bb.Parent = gui
	local t = label(bb, "▼", UDim2.fromScale(1, 1), UDim2.new(), 50)
	t.TextColor3 = color
	t.TextStrokeTransparency = 0
	-- bobbing animation
	TweenService:Create(bb, TweenInfo.new(0.6, Enum.EasingStyle.Sine, Enum.EasingDirection.InOut, -1, true),
		{ StudsOffset = Vector3.new(0, 6.5, 0) }):Play()
	return bb
end

for _, obj in ipairs(binsFolder:GetChildren()) do
	local part = getPart(obj)
	if part then arrows[part] = makeArrow(part, Color3.fromRGB(255, 200, 0)) end
end
local dropArrow = makeArrow(getPart(dropOff), Color3.fromRGB(60, 255, 90))

-- Bin prompts are only shown to you while your job is running (local change only)
local function setBinPrompts(state, emptiedSet)
	for part in pairs(arrows) do
		local prompt = part:FindFirstChild("BinPrompt")
		if prompt then prompt.Enabled = state.active and not emptiedSet[part] end
	end
end

---------------- JOB STATE ----------------
local state = { active = false }

JobUpdate.OnClientEvent:Connect(function(newState)
	state = newState
	local emptiedSet = {}
	for _, bin in ipairs(state.emptied or {}) do emptiedSet[bin] = true end
	for part, bb in pairs(arrows) do
		bb.Enabled = state.active and not emptiedSet[part]
	end
	dropArrow.Enabled = state.active
	hud.Visible = state.active
	setBinPrompts(state, emptiedSet)
end)

-- Hide bin prompts until a job starts
task.defer(function()
	task.wait(1)
	if not state.active then setBinPrompts(state, {}) end
end)

-- Timer loop
while true do
	if state.active then
		local left = math.max(0, math.ceil(state.endTime - workspace:GetServerTimeNow()))
		hud.Text = string.format("🗑 Time: %ds   Delivered: %d", left, state.delivered or 0)
		hud.TextColor3 = left <= 10 and Color3.fromRGB(255, 80, 80) or Color3.new(1, 1, 1)
	end
	task.wait(0.2)
end
